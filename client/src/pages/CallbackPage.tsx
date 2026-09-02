import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import {
  API_BASE_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  ISSUER,
  JWKS_ENDPOINT,
  TOKEN_ENDPOINT,
  getRedirectUri,
} from '@/config';
import { tokenService } from '@/services';
import type { TokenResponseWithNonce } from '@/services/token.service';
import { createProof } from '@/services/dpop.service';
import type { JWK } from '@/services/crypto-utils';
import { readJarmResponse } from '@/utils/jarm';
// Aliased: `JWK` above is a *private* key read out of session storage, and two types differing only
// in capitalisation in one file is a mistake waiting to be made. This one is a JWKS member.
import type { Jwk as JwksKey } from '@/utils/jwt';
import { createClientAssertion } from '@/services/client-assertion.service';
import { useToken } from '@/context/TokenContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TokenOutcome } from '@/components/ui/TokenOutcome';
import { TokenRequestPanel } from '@/components/auth/TokenRequestPanel';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JwtInspector } from '@/components/ui/JwtInspector';
import { Spinner } from '@/components/ui/Spinner';
import type { TokenResponse } from '@/types';
import { SESSION_KEYS, readKey, readJsonKey, writeKey } from '@/services/session-keys';
import { recordNavigation } from '@/services/trace-store';

interface CallbackState {
  error: string | null;
  loading: boolean;
  tokenResponse: TokenResponse | null;
  /**
   * RFC 9207's check could not be performed, and saying so is the point.
   *
   * Non-fatal by design: the exchange still happens, because a client that hard-fails on a missing
   * `iss` cannot talk to an authorization server that does not send one. What it must not do is stay
   * silent — silence makes "the check passed" and "there was nothing to check" look identical.
   */
  issWarning: string | null;
  /**
   * The token request as sent, so `TokenRequestPanel` explains the real thing.
   *
   * Empty until the exchange is attempted — the validation failures above (`state` mismatch, missing
   * verifier, wrong `iss`) all return before a request is built, and there is genuinely nothing to show.
   */
  sentRequest: Record<string, string>;
}

/**
 * The origin of a URL, or `null` when the value is not a URL at all.
 *
 * `new URL()` throws a `TypeError` on `notaurl`, on an empty string and on a bare `http://`, and `iss`
 * arrives from the query string — so the throw is reachable from a hand-edited or truncated callback
 * URL. It used to escape the effect as an unhandled rejection, which left `loading` true forever: the
 * page showed the spinner and "Exchanging authorization code for tokens…" with no error and no way on.
 */
function originOf(value: string): string | null {
  try {
    const { origin } = new URL(value);
    // A non-hierarchical scheme such as `javascript:` yields the string "null" rather than throwing.
    return origin && origin !== 'null' ? origin : null;
  } catch {
    return null;
  }
}

/**
 * Where to go back to, if the value in the session is a path this app may navigate to.
 *
 * Written by `navigateTo` from `window.location`, so in normal operation it is always ours. It is read
 * back through a check anyway, because `sessionStorage` is writable by anything on the origin and this
 * value is handed straight to `navigate()` — and a **protocol-relative** `//evil.example` is a URL, not
 * a path, which is the exact shape that made `post_logout_redirect_uri` matching an open redirect on the
 * server twice. Requiring a single leading slash rejects that, every absolute URL, and every scheme.
 */
function safeReturnTo(): string | null {
  const value = readKey(SESSION_KEYS.returnTo);
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

const CallbackPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setTokenSet } = useToken();
  const [state, setState] = useState<CallbackState>({
    error: null,
    loading: true,
    tokenResponse: null,
    issWarning: null,
    sentRequest: {},
  });

  /**
   * The callback this component has already begun processing.
   *
   * An authorization code is **single-use**, and `main.tsx` wraps the tree in `React.StrictMode`, which
   * in development runs an effect setup → cleanup → setup on the same instance. Without this latch the
   * code was redeemed **twice**: the first request succeeded, the second was refused with
   * `invalid_grant`, and because `setState` lands in resolution order the later failure could overwrite
   * the earlier success. A correct flow reported a protocol error — the worst thing a teaching tool can
   * do — and only in development, which is exactly where learners run it.
   *
   * Keyed on the full query string rather than a boolean, so a genuinely new callback is still
   * processed. A `useRef` survives StrictMode's simulated remount because the component instance is the
   * same one; the guard is set **synchronously**, before the first `await`, or both invocations would
   * pass it.
   */
  const startedRef = useRef<string | null>(null);

  /**
   * The signed authorization response, kept so it can be *read* rather than only acted on.
   *
   * A JARM response is the only artefact in this flow the page previously consumed and then discarded:
   * `readJarmResponse` returns parameters, and the JWS that carried them — its `alg`, its `kid`, its
   * `exp`, and the fact that it is signed at all — went nowhere. On a debugger that exists to show
   * evidence, and which already owns `JwtInspector` for exactly this, that is the wrong thing to throw
   * away. It matters most on the failing cases: "the signature does not verify" is an assertion until
   * you can see the token it is about.
   *
   * **Deliberately its own hook rather than a sixth field on `CallbackState`.** Those five fields are
   * set together, atomically, by a dozen `setState` calls that each write all of them — that is what
   * makes the early returns safe to read. This value is orthogonal: it records what *arrived*, is set
   * once before any check runs, and must survive every one of those outcomes unchanged. Folding it in
   * would mean editing twelve literals for a field none of them has an opinion about.
   */
  const [jarmJwt, setJarmJwt] = useState<string | null>(null);

  // Read once at mount rather than on every render: `navigateTo` rewrites it before the next departure,
  // so re-reading could only ever return the same value or one from a flow that has not happened yet.
  const [returnTo] = useState(safeReturnTo);

  useEffect(() => {
    const search = window.location.search;
    if (startedRef.current === search) return;
    startedRef.current = search;

    /**
     * The redirect that brought us here is the second front-channel hop, and it belongs in the trace.
     *
     * Recorded before anything is validated, so a callback that fails `state` or carries an `error` is
     * still visible in the request history — those are the ones somebody needs the evidence for.
     */
    recordNavigation({
      url: window.location.href,
      direction: 'inbound',
      label: 'callback — front channel, authorization server redirects the browser back',
    });

    const processCallback = async () => {
      const url = new URL(window.location.href);

      /**
       * JARM first, because under `response_mode=jwt` there are no parameters to read.
       *
       * A Message Signing response arrives as one `response=<JWS>` parameter carrying `code`, `state`,
       * `iss` and any error *inside* it. Everything below this block reads `params`, so both response
       * shapes converge here and the `state` binding, the RFC 9207 check and the exchange are the same
       * code either way — the alternative was a second copy of all three, which is how one of them
       * ends up fixed and the other not.
       *
       * **Fail closed.** A `response` that cannot be verified sets an error and returns; it never falls
       * through to the bare query string, or a forged JWT beside a real `?code=` would be ignored in
       * favour of the attacker's parameters.
       */
      let params = url.searchParams;
      const jarmResponse = url.searchParams.get('response');
      if (jarmResponse) {
        // Before any check, so a response that fails one is still on screen to read. The
        // authorization code inside is already in the address bar and in the trace panel, so this
        // discloses nothing the page was not showing.
        setJarmJwt(jarmResponse);
        let jwks: JwksKey[];
        try {
          jwks = (await tokenService.getJwks()).keys as JwksKey[];
        } catch (e) {
          // A JWKS that cannot be fetched is a different failure from a signature that does not
          // verify, and reporting the token as invalid would send the reader to the wrong place.
          setState({
            error: `The authorization response is a signed JWT (JARM), but its signature could not be checked: the JWK Set at ${JWKS_ENDPOINT} could not be fetched — ${e instanceof Error ? e.message : 'unknown error'}.`,
            loading: false,
            tokenResponse: null,
            issWarning: null,
            sentRequest: {},
          });
          return;
        }
        const outcome = await readJarmResponse(jarmResponse, jwks, {
          issuer: ISSUER,
          // The same expression the exchange below uses, so the `aud` this checks is the client the
          // code will be redeemed as. The FAPI wizard writes it at key generation time.
          clientId: readKey(SESSION_KEYS.authzClientId) || CLIENT_ID,
        });
        if (!outcome.ok) {
          setState({
            error: outcome.error,
            loading: false,
            tokenResponse: null,
            issWarning: null,
            sentRequest: {},
          });
          return;
        }
        params = outcome.params;
      }

      const code = params.get('code');
      const stateParam = params.get('state');
      const errorParam = params.get('error');

      if (errorParam) {
        // `error_description` and `error_uri` were being discarded, which threw away the useful half of
        // a failed authorization: RFC 6749 §4.1.2.1 defines all three, and the description is where the
        // server says *what* was wrong. The full string is handed to `ErrorExplainer` below, which
        // decodes the code and any `[Annnnnn]` inside the description.
        const parts = [`error=${errorParam}`];
        const description = params.get('error_description');
        const errorUri = params.get('error_uri');
        if (description) parts.push(`error_description="${description}"`);
        if (errorUri) parts.push(`error_uri="${errorUri}"`);
        setState({
          error: parts.join(', '),
          loading: false,
          tokenResponse: null,
          issWarning: null,
          sentRequest: {},
        });
        return;
      }

      if (!code) {
        setState({
          error: 'Missing authorization code in callback URL',
          loading: false,
          tokenResponse: null,
          issWarning: null,
          sentRequest: {},
        });
        return;
      }

      /**
       * `state` is checked fail-closed.
       *
       * This was `if (expectedState && stateParam && expectedState !== stateParam)`, which skipped the
       * check entirely when *either* side was absent — a callback arriving with no `state`, or after
       * session storage was cleared, went straight on to redeem the code. In a tool whose job is
       * teaching, the one place a learner looks to see how CSRF protection is done modelled the mistake.
       *
       * Absence is now answered as "no", the same rule the server applies to an unknown `acr` and to
       * unset management credentials: an absent value selects the safest behaviour.
       */
      const expectedState = readKey(SESSION_KEYS.oauthState);
      if (!expectedState) {
        setState({
          error:
            'No stored `state` to compare against, so the response cannot be bound to a request this app started. Begin the flow from the Grant Flows section.',
          loading: false,
          tokenResponse: null,
          issWarning: null,
          sentRequest: {},
        });
        return;
      }
      if (!stateParam) {
        setState({
          error:
            'The callback carried no `state`, so it cannot be matched to the request that started it.',
          loading: false,
          tokenResponse: null,
          issWarning: null,
          sentRequest: {},
        });
        return;
      }
      if (expectedState !== stateParam) {
        setState({
          error: `State mismatch — sent "${expectedState}", received "${stateParam}". This is what a CSRF attempt looks like, and the flow stops here.`,
          loading: false,
          tokenResponse: null,
          issWarning: null,
          sentRequest: {},
        });
        return;
      }

      /**
       * RFC 9207: `iss` identifies the authorization server that answered, and comparing it defends
       * against a mix-up attack where a response from one AS is replayed to a client expecting another.
       * This service deliberately does not suppress it (`issSuppressed: false`), so it is present.
       *
       * **Compared as whole origins, with `===`.** This was
       * `API_BASE_URL.startsWith(new URL(issParam).origin)`, and a prefix test on an origin accepts any
       * origin that is a *truncation* of the expected one: measured against
       * `API_BASE_URL = https://oauth.example.com`, both `iss=https://oauth.example.co` and
       * `iss=https://oauth.example` passed. That is the same defect class the server removed from
       * `post_logout_redirect_uri` matching after two live-verified open redirects — reintroduced here,
       * in the mix-up defence, in a file that teaches mix-up defence. `some(u => u === candidate)` is
       * element equality; `String.prototype.startsWith` is a different operation, and the difference is
       * the whole finding.
       *
       * A **missing** `iss` is reported rather than ignored (`issWarning`), but does not stop the
       * exchange — see the note on `CallbackState.issWarning`. An **unparseable** `iss` is treated as a
       * failed comparison rather than as absence, because a value that is present and not a URL is a
       * stronger signal than nothing at all.
       */
      const issParam = params.get('iss');
      const expectedOrigin = originOf(API_BASE_URL);
      let issWarning: string | null = null;

      if (!issParam) {
        issWarning =
          'The response carried no `iss` parameter, so RFC 9207’s mix-up check could not be performed. This service sets `issSuppressed: false` and normally does send it — its absence is worth understanding rather than ignoring.';
      } else if (!expectedOrigin) {
        issWarning = `The response reports iss="${issParam}", but this app’s configured API base URL (${API_BASE_URL}) is not a parseable absolute URL, so the two could not be compared.`;
      } else if (originOf(issParam) !== expectedOrigin) {
        setState({
          error: `The response reports iss="${issParam}", whose origin is not ${expectedOrigin} — the authorization server this app is configured for. RFC 9207 exists to catch exactly this, and the origins are compared whole rather than by prefix.`,
          loading: false,
          tokenResponse: null,
          issWarning: null,
          sentRequest: {},
        });
        return;
      }

      const codeVerifier = readKey(SESSION_KEYS.pkceVerifier);
      if (!codeVerifier) {
        setState({
          error: 'Missing PKCE code verifier in session storage',
          loading: false,
          tokenResponse: null,
          issWarning: null,
          sentRequest: {},
        });
        return;
      }

      // Declared outside the `try` so the `catch` can report it: a failed exchange is the request people
      // most need to read, and scoping it inside would have hidden exactly that case.
      let sentRequest: Record<string, string> = {};

      try {
        const storedClientId = readKey(SESSION_KEYS.authzClientId) || CLIENT_ID;
        const redirectUri = getRedirectUri();

        /**
         * Read as typed JWKs, not `JSON.parse`.
         *
         * `JSON.parse` returns `any`, and that `any` went straight into `crypto.subtle.importKey` as a
         * signing key — the compiler checked nothing about the most sensitive argument on the page. It
         * also **throws** on malformed storage, and this read sits inside the `try`, so a corrupted entry
         * surfaced as "Failed to exchange code for token" rather than as what it was. `readJsonKey`
         * returns `null` instead, and `null` simply means "no key of that kind", which is the branch
         * these two variables already select between.
         */
        const dpopPrivateKeyJwk = readJsonKey<JWK>(SESSION_KEYS.dpopPrivateKey);
        const signingPrivateKeyJwk = readJsonKey<JWK>(SESSION_KEYS.fapiSigningKey);
        let body: TokenResponse;

        /**
         * A public client authenticates with nothing, and "nothing" means the parameter is absent.
         *
         * RFC 6749 §2.3.1 identifies a public client by `client_id` alone. Authlete refuses a client whose
         * method is `none` for carrying client authentication data — `[A157303]`. The SPA's own client is
         * public, and `client_secret` used to go into the body unconditionally, which broke the headline
         * authorization-code + PKCE flow with a misleading `invalid_client`.
         *
         * Measured at the live token endpoint 2026-08-22, because the boundary is not where it looks:
         * `client_secret=your_client_secret` and `client_secret=undefined` are both refused with
         * `[A157303]`, while `client_secret=` (**empty**) and an omitted parameter both pass client
         * authentication and go on to fail on the code. So an empty value would in fact work here — and
         * omission is still what this sends, because §2.3.1 describes a public client as presenting no
         * credentials, and "the vendor tolerates an empty one" is not a thing to build on.
         *
         * It must be an omitted **key** rather than an undefined value: `new URLSearchParams({...})`
         * stringifies, so `client_secret: undefined` puts the literal string "undefined" on the wire —
         * which is the refused case above, not the tolerated one. `secretOrEmpty` in `config.ts` is what
         * stops the `.env` placeholder arriving here as a secret in the first place.
         */
        const storedSecret = readKey(SESSION_KEYS.authzClientSecret) || CLIENT_SECRET;
        // Typed as a record so the *omission* survives: `{ client_secret: string } | {}` widens the
        // absent case to `client_secret?: undefined`, and an explicitly-undefined key is not the same
        // thing as no key — `new URLSearchParams` would stringify it to the literal "undefined", which is
        // the refused shape rather than the tolerated one.
        const clientAuth: Record<string, string> = storedSecret
          ? { client_secret: storedSecret }
          : {};

        /**
         * The parameters common to all three shapes, built once.
         *
         * Assembled here rather than repeated per branch so `TokenRequestPanel` can be handed **the
         * object that was sent** rather than a reconstruction of it — the same rule that makes
         * `AuthorizeRequestBuilder` navigate to the string it displays. A panel that explains a request
         * nobody made is worse than no panel.
         */
        const baseRequest = {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: storedClientId,
          code_verifier: codeVerifier,
        } as const;

        if (dpopPrivateKeyJwk && signingPrivateKeyJwk) {
          // A factory, not a proof. On a `use_dpop_nonce` refusal the proof must be re-signed with the
          // new nonce; the authorization code survives that refusal (verified live 2026-08-17), so the
          // retry inside `dpopRequest` completes the exchange rather than forcing a re-authorization.
          const dpopProof = (nonce?: string) =>
            createProof(dpopPrivateKeyJwk, 'POST', TOKEN_ENDPOINT, undefined, nonce);
          // `ISSUER`, not `TOKEN_ENDPOINT`. The service sets
          // `clientAssertionAudRestrictedToIssuer`, so a token-endpoint `aud` is refused with
          // `401 [A157356]` — this path's private_key_jwt exchange had never succeeded against it.
          const clientAssertion = await createClientAssertion(
            signingPrivateKeyJwk,
            storedClientId,
            ISSUER,
          );
          const request = {
            ...baseRequest,
            client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
            client_assertion: clientAssertion,
          };
          sentRequest = request;
          const result: TokenResponseWithNonce = await tokenService.exchangeCodeForTokenWithDpop(
            request,
            dpopProof,
          );
          body = result.tokenResponse;
        } else if (dpopPrivateKeyJwk) {
          // A factory, not a proof — see the note in the branch above.
          const dpopProof = (nonce?: string) =>
            createProof(dpopPrivateKeyJwk, 'POST', TOKEN_ENDPOINT, undefined, nonce);
          const request = { ...baseRequest, ...clientAuth };
          sentRequest = request;
          const result: TokenResponseWithNonce = await tokenService.exchangeCodeForTokenWithDpop(
            request,
            dpopProof,
          );
          body = result.tokenResponse;
        } else {
          const request = { ...baseRequest, ...clientAuth };
          sentRequest = request;
          body = await tokenService.exchangeCodeForToken(request);
        }

        setTokenSet(body);
        writeKey(SESSION_KEYS.activeClientId, storedClientId);

        setState({
          error: null,
          loading: false,
          tokenResponse: body,
          issWarning,
          sentRequest,
        });
        toast.success('Tokens obtained successfully');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to exchange code for token';
        // The request is kept on failure too — a failing exchange is the one people most need to read.
        setState({
          error: msg,
          loading: false,
          tokenResponse: null,
          issWarning: null,
          sentRequest,
        });
        toast.error(msg);
      }
    };

    // Intentionally not awaited: an effect body cannot be async. Every failure path inside sets state.
    void processCallback();
  }, [location, setTokenSet]);

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle as="h1">Callback</CardTitle>
        {state.loading && (
          <CardDescription>Exchanging authorization code for tokens…</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {state.loading && (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        )}
        {!state.loading && state.error && <ErrorExplainer error={state.error} />}

        {/*
          The signed authorization response, on **both** outcomes and before the token request, because
          that is the order the two arrived in.

          Outside the error and success branches on purpose: the case with most to teach is the one where
          verification failed, and a claim set that looks perfectly reasonable beside "the signature does
          not verify" is the whole point — legible is not the same as authentic. `JwtInspector` fetches
          the JWK Set and scores the signature on its own, so the reader can reach the same verdict the
          page reached, by pressing the button rather than by trusting the sentence.
        */}
        {!state.loading && jarmJwt && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-foreground mb-1.5">
              The signed authorization response (JARM)
            </p>
            <p className="text-xs text-muted-foreground mb-1.5">
              Under <code className="text-foreground-muted">response_mode=jwt</code> the whole
              response — <code className="text-foreground-muted">code</code>,{' '}
              <code className="text-foreground-muted">state</code>,{' '}
              <code className="text-foreground-muted">iss</code> — arrives inside this one JWS
              instead of on the query string.
            </p>
            {/*
              `defaultOpen` because the prop's default is written for the token vault — "off by
              default so a vault entry stays compact", where a dozen inspectors share a screen. There
              is exactly one of these, and it is the artefact that just decided the outcome; leaving
              its claims behind a disclosure triangle on the failure path hides the only thing worth
              reading.
            */}
            <JwtInspector token={jarmJwt} label="authorization response" defaultOpen />
          </div>
        )}

        {/*
          The request, explained, on **both** outcomes.
          This step had no teaching surface at all: no preview, no parameter table, no explanation — over
          the one exchange where PKCE is proven rather than asserted and where four of the six commonest
          OAuth errors live. It matters most on a failure, which is why it is not inside the success
          branch.
        */}
        {!state.loading && Object.keys(state.sentRequest).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-foreground mb-1.5">
              The request that redeemed the code
            </p>
            <TokenRequestPanel body={state.sentRequest} endpoint={TOKEN_ENDPOINT} />
          </div>
        )}
        {!state.loading && state.issWarning && (
          <div
            className="flex gap-2 items-start rounded-lg border border-edge-warning bg-tint-warning p-3 mb-4"
            role="status"
          >
            <AlertTriangle className="h-4 w-4 text-warning-text mt-0.5 shrink-0" />
            <p className="text-xs text-warning-text leading-relaxed">{state.issWarning}</p>
          </div>
        )}
        {!state.loading && !state.error && state.tokenResponse && (
          <div className="space-y-4">
            <p className="text-sm text-success-text">
              Successfully obtained tokens from the authorization server.
            </p>
            {/* Shares one component with the Grant Flows result pane, so both places say the same
                things about the same token — the scheme it must be presented with, its lifetime, its
                scope, and where to spend it. */}
            <TokenOutcome tokens={state.tokenResponse} />
          </div>
        )}
        {/*
          Back to where the flow started, not to the dashboard.

          `/callback` is registered outside `AppLayout`, so this page has no sidebar and no nav and this
          button was the only way out of it — and it went to `/`. Four sections leave through
          `navigateTo` (Grant Flows, PAR, RAR and the FAPI wizard), so finishing any of them meant
          navigating back and finding your place by hand. In the FAPI wizard that made step 3
          effectively unreachable, because step 3 comes *after* the redirect.

          The dashboard link stays beside it: this page is a dead end by construction, and replacing one
          exit with another exit is not an improvement.
        */}
        {!state.loading && (
          <div className="mt-6 flex gap-2">
            {returnTo && (
              <Button onClick={() => navigate(returnTo)}>
                Back to <code className="font-mono ml-1">{returnTo}</code>
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/')}>
              {returnTo ? 'Dashboard' : 'Return to Dashboard'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CallbackPage;
