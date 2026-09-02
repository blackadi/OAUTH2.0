import { useState } from 'react';
import { toast } from 'sonner';
import { parService, tokenService } from '@/services';
import type { ParSuccessResponse } from '@/services/par.service';
import { useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { generateKeyPair, createProof, type DPoPKeyPair } from '@/services/dpop.service';
import {
  generateSigningKeyPair,
  createClientAssertion,
  createRequestObject,
  type SigningKeyPair,
} from '@/services/client-assertion.service';
import { useToken } from '@/context/TokenContext';
import {
  FAPI_CLIENT_ID,
  FAPI_REDIRECT_URI,
  FAPI_SCOPES,
  ISSUER,
  PAR_ENDPOINT,
  AUTHORIZATION_ENDPOINT,
} from '@/config';
import { createPkcePair } from '@/pkce';
import { SESSION_KEYS, writeKey, readJsonKey, type SessionKey } from '@/services/session-keys';
import type { JWK, CryptoKeyPair } from '@/services/crypto-utils';
import { navigateTo } from '@/services/trace-store';

/**
 * The FAPI 2.0 Security Profile flow, as one hook.
 *
 * **Why this is separated from the rendering.** `FapiSection` was 566 lines doing two unrelated jobs:
 * reporting the live FAPI posture (`GET /api/fapi/config`, six fields that used to be hardcoded and
 * every one the opposite of the real configuration) and *driving* a four-step flow. Only the second has
 * sequential state, and it is where the section's dead flow lived — step 2 was gated on the PAR
 * response object being truthy while its handler returned early on the `request_uri` *field*, so the
 * button was **enabled and inert**.
 *
 * That is a hand-off, not a rendering fault, which is the argument for keeping the four steps in one
 * file: `private_key_jwt` at PAR, the DPoP proof at PAR, the same key's proof at UserInfo with an `ath`
 * bound to the token from the callback. Each step consumes what the last produced, and a step that
 * quietly consumes nothing is the failure mode.
 */
/**
 * Read a key pair back out of the session, because the wizard's own memory does not survive step 2.
 *
 * **The defect this closes.** Both key pairs lived only in `useState`, and step 2 is
 * `window.location.href = url` — a full-document navigation that discards them. Coming back from the
 * callback left a section that had forgotten everything it had done while `sessionStorage` still held
 * every byte of it, which produced three separate wrong behaviours: step 3 was **enabled and crashing**
 * (gated on the token, which is session-backed, while dereferencing a key pair that was `null` —
 * measured 2026-09-02 as `TypeError: Cannot read properties of null (reading 'privateKey')`, deferred
 * into the proof factory where a mocked test never invokes it); both *Generate* buttons re-enabled, so
 * one press silently replaced the key the live token is bound to and turned every later call into an
 * unexplainable 401; and the registered JWK Set vanished from the screen mid-run.
 *
 * `kid` comes off the public JWK rather than from its own key, because `generateP256KeyPair` stamps it
 * on both halves before returning — one fact, one place, and no fourth entry to keep in step.
 */
function restoreKeyPair(privateRef: SessionKey, publicRef: SessionKey): CryptoKeyPair | null {
  const privateKey = readJsonKey<JWK>(privateRef);
  const publicKey = readJsonKey<JWK>(publicRef);
  // Both halves or neither: a pair missing one side cannot sign *and* cannot be registered, and
  // returning a half of it would put the section back in the state this function exists to end.
  if (!privateKey || !publicKey) return null;
  return { privateKey, publicKey, kid: publicKey.kid ?? '' };
}

export function useFapiFlow() {
  const { getAccessToken } = useToken();
  // The FAPI client and scope, not the SPA's general-purpose ones — see `FAPI_CLIENT_ID` in config.
  // Both stay editable: demonstrating that a public client is refused is a legitimate thing to do here.
  const [wizClientId, setWizClientId] = useState(FAPI_CLIENT_ID);
  // Not `getRedirectUri()`: that is the SPA's dev callback over http, which FAPI 2.0 §5.3.2.2
  // forbids and this service refuses. See `FAPI_REDIRECT_URI`.
  const [wizRedirectUri, setWizRedirectUri] = useState(FAPI_REDIRECT_URI);
  const [wizScopes, setWizScopes] = useState(FAPI_SCOPES);
  // Lazy initialisers, not `null`: the redirect in step 2 destroys this hook, and these are the only
  // copies that survive it. See `restoreKeyPair`.
  const [wizDpopKeyPair, setWizDpopKeyPair] = useState<DPoPKeyPair | null>(() =>
    restoreKeyPair(SESSION_KEYS.dpopPrivateKey, SESSION_KEYS.dpopPublicKey),
  );
  const [wizSigningKey, setWizSigningKey] = useState<SigningKeyPair | null>(() =>
    restoreKeyPair(SESSION_KEYS.fapiSigningKey, SESSION_KEYS.fapiSigningPublicKey),
  );
  /**
   * Typed by `ParSuccessResponse`, not by an inline shape — and that is the fix, not a tidy-up.
   *
   * This held `{ requestUri?: string; expiresIn?: number }` and cast the response to it. T1-11 made
   * `POST /api/par` answer with RFC 9126 §2.2's body, whose members are `request_uri` and `expires_in`,
   * so `requestUri` became permanently `undefined` — and step 4's handler opens with
   * `if (!wizParResult?.requestUri) return`, which made the Authorize button *enabled and inert*: no
   * redirect, no error, while the panel above it displayed the `request_uri` it refused to use.
   * `RarSection` had exactly this bug and `ParSuccessResponse` exists so the rename is a compile error.
   * A local `as { … }` cast is how a shared type gets bypassed — the lesson worth keeping.
   */
  const [wizParResult, setWizParResult] = useState<ParSuccessResponse | null>(null);
  const [wizUserinfoResult, setWizUserinfoResult] = useState<Record<string, unknown> | null>(null);
  const wizAsync = useDiscriminatedAsyncCall<string>();
  const { loading: wizLoading, error: wizError, call: wizCall } = wizAsync;

  const handleWizGenerateDpopKey = async () => {
    const { error } = await wizCall('setup', async () => {
      const kp = await generateKeyPair();
      writeKey(SESSION_KEYS.dpopPrivateKey, JSON.stringify(kp.privateKey));
      writeKey(SESSION_KEYS.dpopPublicKey, JSON.stringify(kp.publicKey));
      writeKey(SESSION_KEYS.dpopKid, kp.kid);
      writeKey(SESSION_KEYS.authzClientId, wizClientId);
      setWizDpopKeyPair(kp);
    });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('DPoP key pair generated');
  };

  const handleWizGenerateSigningKey = async () => {
    const { error } = await wizCall('setup', async () => {
      const sk = await generateSigningKeyPair();
      writeKey(SESSION_KEYS.fapiSigningKey, JSON.stringify(sk.privateKey));
      writeKey(SESSION_KEYS.fapiSigningPublicKey, JSON.stringify(sk.publicKey));
      setWizSigningKey(sk);
    });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Client auth signing key pair generated');
  };

  const handleWizPar = async () => {
    if (!wizDpopKeyPair || !wizSigningKey) return;
    const { error } = await wizCall('par', async () => {
      const pkce = await createPkcePair();
      writeKey(SESSION_KEYS.pkceVerifier, pkce.codeVerifier);
      const state = crypto.randomUUID();
      writeKey(SESSION_KEYS.oauthState, state);

      // `ISSUER`, not the token endpoint: FAPI 2.0 §5.3.2.1 permits only the issuer identifier in
      // `aud`, and this service enforces it. See `createClientAssertion`.
      const clientAssertion = await createClientAssertion(
        wizSigningKey.privateKey,
        wizClientId,
        ISSUER,
      );

      /**
       * The authorization parameters travel as a signed request object (JAR, RFC 9101), which the
       * Message Signing Profile requires — bare parameters earn `400 invalid_request` from a client
       * with `requestObjectRequired`, or from any request carrying a scope tagged `fapi2: ms-authreq`.
       *
       * `client_id` is sent BOTH inside the object and beside it. RFC 9126 §3 needs the outer copy to
       * find the client and its keys before it can verify the signature; the inner copy is what the
       * verified request actually says. The client assertion stays outside too — it authenticates the
       * PAR call itself, and is not part of the authorization request being signed.
       */
      const requestObject = await createRequestObject(
        wizSigningKey.privateKey,
        wizClientId,
        ISSUER,
        {
          response_type: 'code',
          client_id: wizClientId,
          redirect_uri: wizRedirectUri,
          scope: wizScopes,
          code_challenge: pkce.codeChallenge,
          code_challenge_method: 'S256',
          state,
          /**
           * **Required, not decorative.** `myscope` carries the `fapi2: ms-authres` attribute, which
           * is the second half of Message Signing: the authorization *response* must be a signed JWT
           * (JARM). Omitting this left Authlete defaulting to `response_mode=query`, which the
           * profile forbids — so every run of this wizard died at step 2 with an error redirect
           * carrying `[A309301] The value of 'response_mode' must be 'jwt'.`
           *
           * `scripts/fapi2-conformance.mjs` has sent this since Message Signing was turned on (see
           * its `USE_JARM`, which defaults to `USE_JAR` for exactly this reason). The wizard was the
           * one FAPI path that never got it, and nothing could see that: a front-channel refusal
           * produces no failing request, no console error and no trace row on the page that sent it.
           *
           * The response therefore comes back as `?response=<JWS>` with no bare `code`, `state` or
           * `iss` — `readJarmResponse` in `utils/jarm.ts` is the other end of this change.
           */
          response_mode: 'jwt',
        },
      );

      const params = new URLSearchParams({
        client_id: wizClientId,
        request: requestObject,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: clientAssertion,
      });

      const { data } = await parService.pushedAuthorizationWithDpop(
        { parameters: params.toString() },
        // A factory, not a proof: a `use_dpop_nonce` retry needs a fresh signature, and `dpopRequest`
        // owns the `dpop_nonce` store.
        (nonce) => createProof(wizDpopKeyPair.privateKey, 'POST', PAR_ENDPOINT, undefined, nonce),
      );
      setWizParResult(data as ParSuccessResponse);
    });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('PAR succeeded');
  };

  const handleWizAuthorize = () => {
    if (!wizParResult?.request_uri) return;
    const authorizeUrl = `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(wizClientId)}&request_uri=${encodeURIComponent(wizParResult.request_uri)}`;
    // `navigateTo` records the hop and then leaves. This used to be a bare assignment, so a FAPI 2.0
    // run's outbound hop was invisible in the trace panel and in `SequenceView`.
    navigateTo(
      authorizeUrl,
      'authorize (FAPI 2.0, PAR) — front channel, browser leaves for the authorization endpoint',
      // Step 3 is what comes next, and it is *after* the redirect — which is why it was the step
      // nobody reached. `#fapi-step-3` exists on the element already and `useHashScroll` (wired in
      // `AppLayout`) scrolls and focuses it, so the callback returns the reader to the exact step.
      '/fapi#fapi-step-3',
    );
  };

  /**
   * Step 3 goes through `tokenService.userInfoForToken`, which owns the scheme decision and sources the
   * DPoP key from the session.
   *
   * It used to build the proof from `wizDpopKeyPair!` — a second copy of a decision `TokenOpsSection`
   * already made correctly, and the `!` is what let the compiler miss that this hook's state is empty
   * after step 2's redirect. Two implementations of "present this token the way it must be presented"
   * had already diverged into one that worked and one that threw.
   */
  const handleWizUserinfo = async () => {
    const { error } = await wizCall('userinfo', async () => {
      const accessToken = getAccessToken();
      if (!accessToken)
        throw new Error('No access token stored in context. Complete the authorize step first.');
      // Always DPoP here: a FAPI 2.0 token from this client is sender-constrained by definition, and
      // asking the context would let a stale bearer token from another section pick the wrong scheme.
      const data = await tokenService.userInfoForToken(accessToken, true);
      setWizUserinfoResult(data as Record<string, unknown>);
    });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Userinfo fetched with DPoP');
  };

  return {
    loading: wizLoading,
    error: wizError,
    clientId: wizClientId,
    setClientId: setWizClientId,
    redirectUri: wizRedirectUri,
    setRedirectUri: setWizRedirectUri,
    scopes: wizScopes,
    setScopes: setWizScopes,
    dpopKeyPair: wizDpopKeyPair,
    signingKey: wizSigningKey,
    parResult: wizParResult,
    userinfoResult: wizUserinfoResult,
    /** `getAccessToken()` at render time, so the step-3 gate reflects the callback having run. */
    hasToken: Boolean(getAccessToken()),
    /**
     * Both halves of what step 3 needs, so its button is gated on the key *and* the token.
     *
     * Gating on the token alone is what made the button enabled and crashing: the token survives the
     * redirect in session storage and the key pair did not. Each step gates on the field it is about to
     * use — the same rule this section learned from `request_uri`.
     */
    hasDpopKey: Boolean(wizDpopKeyPair),
    generateDpopKey: handleWizGenerateDpopKey,
    generateSigningKey: handleWizGenerateSigningKey,
    pushPar: handleWizPar,
    authorize: handleWizAuthorize,
    fetchUserinfo: handleWizUserinfo,
  };
}

export type FapiFlow = ReturnType<typeof useFapiFlow>;
