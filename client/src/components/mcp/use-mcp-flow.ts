import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { mcpService, dcrService } from '@/services';
import { useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { parseJsonObject, stringMember } from '@/utils/parse-json';
import { API_BASE_URL, CLIENT_ID, REDIRECT_URI, DEFAULT_SCOPES } from '@/config';
import { createPkcePair } from '@/pkce';
import { useCredentials } from '@/context/CredentialContext';
import { useToken } from '@/context/TokenContext';
import {
  SESSION_KEYS,
  readKey,
  readJsonKey,
  writeKey,
  removeKey,
  clearDpopKeys,
} from '@/services/session-keys';
import { navigateTo } from '@/services/trace-store';

/**
 * The MCP OAuth 2.1 flow, as one hook.
 *
 * **Why this is separated from the rendering.** `McpSection` was 661 lines carrying twenty `useState`
 * calls, and fifteen of them belonged to the six-step wizard rather than to the three discovery tabs
 * above it. The wizard is a **sequence** — discover, register, authorize, exchange, userinfo,
 * introspect — where each step consumes what the one before it produced, and that is the part worth
 * being able to read on its own: `McpWizard.tsx` is now the six cards and nothing else.
 *
 * The two dead flows this section carried were both in here, and both were hand-offs between steps
 * rather than anything visual: step 2 read the DCR `client_secret` into a local used only in a toast, so
 * step 4 exchanged the code with no client authentication; and `introspectToken` existed and was called
 * from nowhere, so the `mcp.introspect` doc entry had no surface to render on. Keeping the sequence in
 * one file is what makes a missing hand-off visible.
 */

/**
 * The six asynchronous operations the wizard can run, as a closed set.
 *
 * These strings were already the discriminator passed to `wizCall`, but the hook was instantiated at
 * `<string>`, so `flow.loading === 'Dsicover AS'` compiled and simply never matched. They are now a
 * union because `McpWizard` maps each one back to the card it belongs to, and a typo in that map would
 * silently render a failure under the wrong step — the exact defect this placement change exists to
 * end. Step 3 has no entry: building the authorization URL is local work and cannot fail against a
 * server.
 */
export type McpStep =
  'Discover AS' | 'Fetch CIMD' | 'DCR Register' | 'Exchange Code' | 'Fetch UserInfo' | 'Introspect';

/**
 * The discovery members this wizard actually branches on.
 *
 * `resource_indicators_supported` was declared here and read by Step 1's capability line until
 * 2026-09-10, and it is not a thing. Verified against the IANA OAuth Authorization Server Metadata
 * registry — unregistered; the only resource-related member is `protected_resources`, RFC 9728 §4 —
 * and against the MCP authorization specification (draft), which never mentions it and requires
 * clients to send `resource` *"regardless of whether authorization servers support it."* Authlete
 * has no flag for it either: the live service object carries 135 fields and none is one. So the
 * field could only ever be `undefined`, and a badge that never appears is indistinguishable from a
 * check that never ran.
 */
export interface AsMetadata {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
  grant_types_supported?: string[];
  response_types_supported?: string[];
  [key: string]: unknown;
}

export interface CimdMetadata {
  client_name?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
  [key: string]: unknown;
}

/**
 * What has to outlive the redirect for the wizard to still make sense on the way back.
 *
 * Steps 2 and 3 gate on `asData` and step 4 on `authUrl`, and both were plain `useState` — so a
 * reader returning from a *successful* authorization was told to "Run Step 1 first" by three cards
 * while steps 5 and 6 ran off the token that had survived in `TokenContext`. Measured on return:
 * steps 2, 3 and 4 announcing `aria-disabled`, 5 and 6 live. A section that has forgotten it
 * discovered the authorization server while still holding the token it got from it is the defect
 * `use-fapi-flow.ts` records for its own key pairs.
 *
 * This could not happen before the wizard left through `navigateTo`: step 3 opened the URL in a new
 * tab, so this hook was never unmounted. Making the same-tab redirect the primary path is what made
 * the gap reachable, which is why the two changes belong together.
 *
 * `issuer` travels with them because steps 5 and 6 fall back to it when the metadata names no
 * endpoint.
 */
interface WizardProgress {
  issuer: string;
  asData: AsMetadata | null;
  authUrl: string;
  /**
   * `resource` travels too, and it was the one field of the four that did not.
   *
   * It is written to `SESSION_KEYS.authzResource` before the redirect, so the authorization *and*
   * the token request both carried it and the audience restriction really happened — but the field
   * itself came back empty, so Step 6 could not tell "no resource was requested" from "the resource
   * was requested and then forgotten". The same amnesia the other three fields were added to fix,
   * in the one field Step 6's verdict has to read to say anything true.
   */
  resource: string;
}

export function useMcpFlow() {
  /** Read once, at mount, so the four lazy initialisers below cannot disagree with each other. */
  const [restored] = useState(() => readJsonKey<WizardProgress>(SESSION_KEYS.mcpWizard));

  const {
    loading,
    error,
    errorLabel: wizErrorLabel,
    call: wizCall,
    fail: wizFail,
  } = useDiscriminatedAsyncCall<McpStep>();
  // The management credential is shared for the page rather than owned here: eight sections held their
  // own copy, and a route change unmounts a section, so it had to be retyped on every navigation.
  const { clientId: authId, clientSecret: authSecret } = useCredentials();
  /**
   * The token set the *callback* obtained, when it was the callback that obtained one.
   *
   * `CallbackPage` writes its exchange into `TokenContext` rather than into this hook, so without
   * reading it back the wizard would authorize successfully and then show steps 5 and 6 still gated —
   * a flow that dead-ends one step after its hardest moment. `useToken` is the app's owner of the
   * current token set and `use-fapi-flow.ts` already reads it for the same reason.
   */
  const { tokenSet } = useToken();

  const [wizIssuer, setWizIssuer] = useState(() => restored?.issuer ?? API_BASE_URL);
  const [wizAsData, setWizAsData] = useState<AsMetadata | null>(() => restored?.asData ?? null);
  const [wizCimdUrl, setWizCimdUrl] = useState('');
  const [wizCimdData, setWizCimdData] = useState<CimdMetadata | null>(null);
  const [wizClientId, setWizClientId] = useState(CLIENT_ID);
  /**
   * Kept, not discarded. Step 2 read the DCR `client_secret` into a local, used it in a toast and threw
   * it away, so step 4 exchanged the code with no client authentication for a client it had just
   * registered as confidential. Registration now asks for `NONE`, but Authlete may answer with a
   * secret anyway (AGENTS.md, "Client auth for DCR confidential clients"), and `exchangeCode` sends it
   * only when non-empty.
   */
  const [wizClientSecret, setWizClientSecret] = useState('');
  /**
   * The client id an authorization server actually gave back, as distinct from the one in the field.
   *
   * **The defect this exists to end.** Step 2's "landed" marker and the flow diagram both read
   * `clientId !== CLIENT_ID`, so typing a single character into the editable "Client ID
   * (auto-filled)" field filled the marker with the issued colour, flipped the turn to
   * `data-dir="in"`, and made the diagram announce "Register: completed" — through `aria-label`, so
   * assistive technology heard it too. No request had been made.
   *
   * `transcript.css` states this world's one inviolable rule: a coloured pixel means the server
   * spoke. And this is the section that teaches OAuth, so a green "registered" for a client that was
   * never registered is a false claim about a protocol step, in the tool a reader will trust over
   * their own reading. Set only in the success branches of `wizStepCimd` and `wizStepDcr`.
   */
  const [wizRegisteredClientId, setWizRegisteredClientId] = useState<string | null>(null);
  const [wizRedirectUri, setWizRedirectUri] = useState(REDIRECT_URI);
  const [wizScopes, setWizScopes] = useState(DEFAULT_SCOPES);
  const [wizResource, setWizResource] = useState(() => restored?.resource ?? '');
  const [wizCode, setWizCode] = useState('');
  /**
   * A lazy initialiser, not `''`: leaving for the authorization endpoint destroys this hook, and the
   * copy in session storage is the only one that survives it.
   *
   * The same shape as `use-fapi-flow.ts`'s key-pair restore, and for the same reason its docblock
   * records — a section that had forgotten everything it had done while `sessionStorage` still held
   * every byte of it. Before this the wizard only survived because step 3 opened the URL in a *new*
   * tab; a reader who followed it in this one lost the verifier and could never complete step 4.
   */
  const [wizCodeVerifier, setWizCodeVerifier] = useState(
    () => readKey(SESSION_KEYS.pkceVerifier) ?? '',
  );
  // No `wizPkcePair` state: it was written on every authorize step and never read. `wizCodeVerifier` below
  // holds the only half the token exchange needs, and the challenge is consumed inline by the URL builder.
  const [wizAuthUrl, setWizAuthUrl] = useState(() => restored?.authUrl ?? '');
  const [wizTokenResult, setWizTokenResult] = useState<Record<string, unknown> | null>(null);
  const [wizUserinfoResult, setWizUserinfoResult] = useState<Record<string, unknown> | null>(null);

  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';
  const [wizIntrospectResult, setWizIntrospectResult] = useState<Record<string, unknown> | null>(
    null,
  );

  /**
   * Write the snapshot the redirect will need.
   *
   * Called from the two steps that change what the later steps gate on, rather than from an effect
   * watching the values: a `setState`-shaped effect is the cascading render
   * `react-hooks/set-state-in-effect` exists to reject, and there are exactly two moments that matter.
   */
  const saveProgress = useCallback(
    (next: Partial<WizardProgress>) => {
      writeKey(
        SESSION_KEYS.mcpWizard,
        JSON.stringify({
          issuer: wizIssuer,
          asData: wizAsData,
          authUrl: wizAuthUrl,
          resource: wizResource,
          ...next,
        } satisfies WizardProgress),
      );
    },
    [wizIssuer, wizAsData, wizAuthUrl, wizResource],
  );

  const wizStepDiscover = useCallback(async () => {
    const { data, error: err } = await wizCall('Discover AS', () =>
      mcpService.fetchAsMetadata(wizIssuer),
    );
    if (data) {
      const asData = data as AsMetadata;
      setWizAsData(asData);
      // `asData` explicitly rather than from state: this closure still holds the previous value.
      saveProgress({ issuer: wizIssuer, asData });
      toast.success('AS metadata loaded');
    } else {
      toast.error(err);
    }
  }, [wizIssuer, wizCall, saveProgress]);

  const wizStepCimd = useCallback(async () => {
    if (!wizCimdUrl) {
      wizFail('Fetch CIMD', 'Enter a CIMD URL first');
      toast.error('Enter a CIMD URL first');
      return;
    }
    const { data, error: err } = await wizCall('Fetch CIMD', () =>
      mcpService.fetchCimdMetadata(wizCimdUrl),
    );
    if (data) {
      const cimdData = data as CimdMetadata;
      setWizCimdData(cimdData);
      // Pre-fill from CIMD metadata
      if (cimdData.redirect_uris?.[0]) setWizRedirectUri(cimdData.redirect_uris[0]);
      if (cimdData.scope) setWizScopes(cimdData.scope);
      // Use CIMD URL as client_id
      setWizClientId(wizCimdUrl);
      setWizRegisteredClientId(wizCimdUrl);
      toast.success('CIMD metadata loaded — client_id set to CIMD URL');
    } else {
      toast.error(err);
    }
  }, [wizCimdUrl, wizCall, wizFail]);

  const wizStepDcr = useCallback(async () => {
    if (!auth) {
      wizFail('DCR Register', 'Enter admin credentials first');
      toast.error('Enter admin credentials first');
      return;
    }
    const metadata = {
      client_name: 'MCP Test Client',
      redirect_uris: [wizRedirectUri],
      grant_types: ['AUTHORIZATION_CODE', 'REFRESH_TOKEN'],
      response_types: ['CODE'],
      // A public client with PKCE, which is what MCP and OAuth 2.1 expect of a browser app — and it
      // is what step 3 already does. This asked for `CLIENT_SECRET_BASIC`, whose secret step 4 then
      // failed to present.
      token_endpoint_auth_method: 'NONE',
      scope: wizScopes,
    };
    const { data, error: err } = await wizCall('DCR Register', () =>
      dcrService.dcrRegister({ json: JSON.stringify(metadata) }, auth),
    );
    if (data) {
      const raw = data as Record<string, unknown>;
      /**
       * Asked, not asserted.
       *
       * These four reads were `(responseContent.client_id || responseContent.clientId || '') as string`
       * off a `JSON.parse` result — so the compiler checked nothing about a value that becomes the
       * **client secret** used for the token exchange two steps later. `stringMember` returns a string
       * only if there is one, and both spellings are tried because DCR answers snake_case while
       * Authlete's envelope answers camelCase.
       */
      const responseContent =
        typeof raw.responseContent === 'string' ? parseJsonObject(raw.responseContent) : raw;
      const clientId = stringMember(responseContent, 'client_id', 'clientId') ?? '';
      const clientSecret = stringMember(responseContent, 'client_secret', 'clientSecret') ?? '';
      if (clientId) {
        setWizClientId(clientId);
        setWizRegisteredClientId(clientId);
        setWizClientSecret(clientSecret);
        toast.success(
          `DCR registered: client_id=${clientId}${clientSecret ? ' — a secret came back despite asking for NONE; it will be sent on the exchange' : ' (public, PKCE only)'}`,
        );
      }
    } else {
      toast.error(err);
    }
  }, [auth, wizRedirectUri, wizScopes, wizCall, wizFail]);

  /**
   * Build the authorization URL, and write down everything the callback will need.
   *
   * **Two defects closed here.**
   *
   * *One:* this minted a fresh PKCE pair on every click and dropped the previous verifier on the
   * floor. Click it twice while holding a code and step 4 failed with `invalid_grant` — correctly
   * explained, by a message with no visible connection to the click that caused it. A fresh verifier
   * per authorization request is right (RFC 7636 §7.1 SHOULD), so the fix is not to reuse one: it is
   * to discard the code that went with the old one, here, visibly, rather than leaving a value in the
   * field that cannot be exchanged. `McpWizard` asks first when there is a code to lose.
   *
   * *Two:* the verifier and the state existed only in this hook, so this was the one flow in the
   * application that could not survive its own redirect — while its default `redirectUri` is this
   * SPA's `/callback`. `AuthorizationCodePanel`, `ParSection`, `RarSection` and the FAPI wizard all
   * write the same keys before leaving; MCP not doing so is why a code landing on `/callback` from
   * here was refused with "No stored `state` to compare against", and why step 4 asks for a
   * hand-copied code at all.
   *
   * **Every write has an else-remove branch**, which is the rule `AuthorizationCodePanel` learned the
   * hard way: a stale `authz_client_secret` left behind by a missing else produced an unexplainable
   * `[A157303]`. Absence has to be written down to be absent.
   */
  const wizStepAuthorize = useCallback(async () => {
    const pair = await createPkcePair();
    setWizCodeVerifier(pair.codeVerifier);
    writeKey(SESSION_KEYS.pkceVerifier, pair.codeVerifier);
    // The code that belonged to the previous challenge. It cannot be exchanged against this one.
    setWizCode('');

    /**
     * `crypto.randomUUID()`, not `mcp-${Date.now()}`.
     *
     * This state was write-only until now — generated, sent, never compared — so its predictability
     * cost nothing. `CallbackPage` validates it fail-closed, so from here it is the CSRF binding for
     * this flow, and a timestamp is guessable. Every other generator in the client already uses
     * `randomUUID`; this was the one that did not.
     */
    const state = crypto.randomUUID();
    writeKey(SESSION_KEYS.oauthState, state);

    writeKey(SESSION_KEYS.authzClientId, wizClientId);
    // Public client with PKCE is the MCP shape, but DCR may hand back a secret anyway (see
    // `wizClientSecret`), and the exchange must present it when it exists and nothing when it does not.
    if (wizClientSecret) writeKey(SESSION_KEYS.authzClientSecret, wizClientSecret);
    else removeKey(SESSION_KEYS.authzClientSecret);

    // RFC 8707. Sending `resource` on the authorization request alone changes nothing observable; the
    // token request's copy is what restricts the issued token's `aud`, and the callback reads it here.
    if (wizResource) writeKey(SESSION_KEYS.authzResource, wizResource);
    else removeKey(SESSION_KEYS.authzResource);

    /**
     * Clear the keys that would silently pick a different exchange.
     *
     * `CallbackPage` chooses between three exchange shapes by the **presence** of `dpop_private_key`
     * and `fapi_signing_private_key`, so a reader who visited the FAPI section earlier in the same tab
     * still has a signing key sitting there — and this flow's public-client exchange would quietly
     * become a `private_key_jwt` one. That is not a hypothetical: it is verbatim the defect
     * `services/session-keys.ts` was written to end, and it is why that module owns every key.
     *
     * MCP OAuth 2.1 is a public client with PKCE: no DPoP proof, no client assertion. `clearDpopKeys`
     * covers the four DPoP keys and deliberately not the two FAPI ones, so those are named here.
     */
    clearDpopKeys();
    removeKey(SESSION_KEYS.fapiSigningKey);
    removeKey(SESSION_KEYS.fapiSigningPublicKey);

    const authUrl = mcpService.buildAuthorizationUrl({
      issuer: wizIssuer,
      // Step 1's document, when it has run. Without this the section claimed to build the URL from
      // discovered metadata and then ignored it.
      authorizationEndpoint: wizAsData?.authorization_endpoint,
      clientId: wizClientId,
      redirectUri: wizRedirectUri,
      scope: wizScopes,
      codeChallenge: pair.codeChallenge,
      resource: wizResource || undefined,
      state,
    });
    setWizAuthUrl(authUrl);
    saveProgress({ authUrl });
    toast.success('Authorization URL built — authorize, or open it yourself');
  }, [
    wizIssuer,
    wizClientId,
    wizClientSecret,
    wizRedirectUri,
    wizScopes,
    wizResource,
    wizAsData,
    saveProgress,
  ]);

  /**
   * Leave for the authorization endpoint.
   *
   * `navigateTo` rather than a bare assignment or a `target="_blank"` anchor. It is the single place
   * this application leaves the front channel: it records the outbound hop, so the run shows up in the
   * trace panel and in `SequenceView`, and it writes `return_to` so the callback can offer the way
   * back. A new tab was the previous behaviour and it is the one shape that defeats the persistence
   * above — session storage is per-tab, so the verifier would not be there when the callback looked.
   *
   * `#mcp-step-4` is where the reader needs to be afterwards, and it is the step nobody reached; the
   * anchor is already on that card and `useHashScroll` scrolls and focuses it.
   */
  const wizGoAuthorize = useCallback(() => {
    if (!wizAuthUrl) return;
    navigateTo(
      wizAuthUrl,
      'mcp authorize (PKCE + resource) — front channel, browser leaves for the authorization endpoint',
      '/mcp#mcp-step-4',
    );
  }, [wizAuthUrl]);

  const wizStepToken = useCallback(async () => {
    if (!wizCode || !wizCodeVerifier) {
      wizFail('Exchange Code', 'Enter the authorization code from the callback');
      toast.error('Enter the authorization code from the callback');
      return;
    }
    const tokenEndpoint = wizAsData?.token_endpoint || `${wizIssuer}/api/token`;
    const { data, error: err } = await wizCall('Exchange Code', () =>
      mcpService.exchangeCode({
        tokenEndpoint,
        code: wizCode,
        clientId: wizClientId,
        redirectUri: wizRedirectUri,
        codeVerifier: wizCodeVerifier,
        // MCP requires `resource` on BOTH requests. The same value the authorize step used.
        resource: wizResource || undefined,
        clientSecret: wizClientSecret || undefined,
      }),
    );
    if (data) {
      setWizTokenResult(data as Record<string, unknown>);
      toast.success('Token exchange successful');
    } else {
      toast.error(err);
    }
  }, [
    wizCode,
    wizCodeVerifier,
    wizAsData,
    wizIssuer,
    wizClientId,
    wizClientSecret,
    wizRedirectUri,
    wizResource,
    wizCall,
    wizFail,
  ]);

  /**
   * The token this wizard is working with, from whichever half of the flow produced it.
   *
   * Step 4's own exchange fills `wizTokenResult`; authorizing through the callback fills
   * `TokenContext` instead. Steps 5 and 6 need one answer to "is there a token yet", and gating them
   * on the local copy alone is what would leave them greyed out immediately after a successful
   * authorization.
   */
  const wizEffectiveToken: Record<string, unknown> | null =
    wizTokenResult ?? (tokenSet as Record<string, unknown> | null);

  const wizStepUserinfo = useCallback(async () => {
    const accessToken = (wizEffectiveToken as Record<string, unknown>)?.access_token as string;
    if (!accessToken) {
      wizFail('Fetch UserInfo', 'No access token available — complete token exchange first');
      toast.error('No access token available — complete token exchange first');
      return;
    }
    const userinfoEndpoint = wizAsData?.userinfo_endpoint || `${wizIssuer}/api/userinfo`;
    const { data, error: err } = await wizCall('Fetch UserInfo', () =>
      mcpService.fetchUserInfo(userinfoEndpoint, accessToken),
    );
    if (data) {
      setWizUserinfoResult(data as Record<string, unknown>);
      toast.success('UserInfo fetched');
    } else {
      toast.error(err);
    }
  }, [wizEffectiveToken, wizAsData, wizIssuer, wizCall, wizFail]);

  /**
   * Introspect the token the wizard just obtained.
   *
   * `mcpService.introspectToken` existed and was called from nowhere, so the `mcp.introspect` entry in
   * the documentation registry had no surface to render on — and had it been wired as written it would
   * have failed, because it sent no credentials to an endpoint that requires them. Both halves are
   * closed here: the endpoint comes from the AS metadata the wizard already fetched rather than from
   * string surgery on the token endpoint, and the admin credentials come from the field at the top of
   * this section. RFC 7662 §2.1 requires the endpoint to be protected; this deployment protects it with
   * management credentials, so without them the answer is 401 and nothing else.
   */
  const wizStepIntrospect = useCallback(async () => {
    const accessToken = (wizEffectiveToken as Record<string, unknown>)?.access_token as string;
    if (!accessToken) {
      wizFail('Introspect', 'No access token available — complete token exchange first');
      toast.error('No access token available — complete token exchange first');
      return;
    }
    if (!authId || !authSecret) {
      wizFail(
        'Introspect',
        "Introspection needs this deployment's admin credentials — fill them in at the top of this flow",
      );
      toast.error(
        "Introspection needs this deployment's admin credentials — fill them in at the top of this flow",
      );
      return;
    }
    /**
     * The RFC 7662 path, deliberately not the discovered member.
     *
     * **A correction to a comment that stood here and was wrong.** It claimed the concern had been
     * measured away — that the advertised `introspection_endpoint` was already the RFC 7662
     * `/api/introspection/standard`, so there was no mismatch. That measurement read
     * `/.well-known/openid-configuration`. `fetchAsMetadata` tries `/.well-known/
     * oauth-authorization-server` **first**, and the two documents this deployment serves disagree:
     *
     *   RFC 8414 path        → `…/api/introspection`           (Authlete-shaped)
     *   OIDC Discovery path  → `…/api/introspection/standard`  (RFC 7662)
     *
     * So the original concern was right: Step 1 populates `asData` from the RFC 8414 document, and
     * trusting its member sent an RFC 7662 body to an endpoint with a different contract — the final
     * step getting *more* likely to fail the more correctly the flow was run. `AGENTS.md` says it
     * plainly: reading one document proves nothing about the other.
     *
     * `mcpService.introspectToken` sends an RFC 7662 request, so it goes to the RFC 7662 endpoint.
     * The discovered member is honoured only when it already names that path, which keeps discovery
     * meaningful for a deployment whose documents agree.
     */
    const discovered = wizAsData?.introspection_endpoint as string | undefined;
    const endpoint =
      discovered && discovered.endsWith('/standard')
        ? discovered
        : `${wizIssuer}/api/introspection/standard`;
    const { data, error: err } = await wizCall('Introspect', () =>
      mcpService.introspectToken(endpoint, accessToken, authId, authSecret),
    );
    if (data) {
      setWizIntrospectResult(data as Record<string, unknown>);
      toast.success('Token introspected');
    } else {
      toast.error(err);
    }
  }, [wizEffectiveToken, wizAsData, wizIssuer, authId, authSecret, wizCall, wizFail]);

  return {
    loading,
    error,
    /**
     * Which step `error` came from, so the card that failed is the card that explains it.
     *
     * `loading` cannot answer this — it is cleared in the hook's `finally`, so by the time a failure
     * renders it is already `null`.
     */
    failedStep: wizErrorLabel,
    /** Every field the six cards render, and the setters for the ones a user can type into. */
    issuer: wizIssuer,
    setIssuer: setWizIssuer,
    asData: wizAsData,
    cimdUrl: wizCimdUrl,
    setCimdUrl: setWizCimdUrl,
    cimdData: wizCimdData,
    clientId: wizClientId,
    setClientId: setWizClientId,
    redirectUri: wizRedirectUri,
    setRedirectUri: setWizRedirectUri,
    scopes: wizScopes,
    setScopes: setWizScopes,
    resource: wizResource,
    setResource: setWizResource,
    code: wizCode,
    setCode: setWizCode,
    codeVerifier: wizCodeVerifier,
    setCodeVerifier: setWizCodeVerifier,
    authUrl: wizAuthUrl,
    tokenResult: wizEffectiveToken,
    userinfoResult: wizUserinfoResult,
    introspectResult: wizIntrospectResult,
    /**
     * Non-null once a server has answered a registration. The wizard reads this, never the field,
     * for anything that claims the step happened.
     */
    registeredClientId: wizRegisteredClientId,
    /** `auth` is exposed so the wizard can disable the DCR button without re-deriving it. */
    hasAdminCredential: Boolean(auth),
    stepDiscover: wizStepDiscover,
    stepCimd: wizStepCimd,
    stepDcr: wizStepDcr,
    stepAuthorize: wizStepAuthorize,
    /** Leaves the app for the authorization endpoint. Only meaningful once `authUrl` exists. */
    goAuthorize: wizGoAuthorize,
    stepToken: wizStepToken,
    stepUserinfo: wizStepUserinfo,
    stepIntrospect: wizStepIntrospect,
  };
}

export type McpFlow = ReturnType<typeof useMcpFlow>;
