import { useState } from 'react';
import { toast } from 'sonner';
import { parService, tokenService } from '@/services';
import type { ParSuccessResponse } from '@/services/par.service';
import { useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import {
  generateKeyPair,
  createProof,
  computeAth,
  type DPoPKeyPair,
} from '@/services/dpop.service';
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
  USERINFO_ENDPOINT,
} from '@/config';
import { createPkcePair } from '@/pkce';
import { SESSION_KEYS, writeKey } from '@/services/session-keys';
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
export function useFapiFlow() {
  const { getAccessToken } = useToken();
  // The FAPI client and scope, not the SPA's general-purpose ones — see `FAPI_CLIENT_ID` in config.
  // Both stay editable: demonstrating that a public client is refused is a legitimate thing to do here.
  const [wizClientId, setWizClientId] = useState(FAPI_CLIENT_ID);
  // Not `getRedirectUri()`: that is the SPA's dev callback over http, which FAPI 2.0 §5.3.2.2
  // forbids and this service refuses. See `FAPI_REDIRECT_URI`.
  const [wizRedirectUri, setWizRedirectUri] = useState(FAPI_REDIRECT_URI);
  const [wizScopes, setWizScopes] = useState(FAPI_SCOPES);
  const [wizDpopKeyPair, setWizDpopKeyPair] = useState<DPoPKeyPair | null>(null);
  const [wizSigningKey, setWizSigningKey] = useState<SigningKeyPair | null>(null);
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
    );
  };

  const handleWizUserinfo = async () => {
    const { error } = await wizCall('userinfo', async () => {
      const accessToken = getAccessToken();
      if (!accessToken)
        throw new Error('No access token stored in context. Complete the authorize step first.');
      const athValue = await computeAth(accessToken);
      const { data } = await tokenService.userInfoWithDpop(accessToken, (nonce) =>
        createProof(wizDpopKeyPair!.privateKey, 'POST', USERINFO_ENDPOINT, athValue, nonce),
      );
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
    generateDpopKey: handleWizGenerateDpopKey,
    generateSigningKey: handleWizGenerateSigningKey,
    pushPar: handleWizPar,
    authorize: handleWizAuthorize,
    fetchUserinfo: handleWizUserinfo,
  };
}

export type FapiFlow = ReturnType<typeof useFapiFlow>;
