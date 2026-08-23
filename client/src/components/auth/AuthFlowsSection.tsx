import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  AUTHORIZATION_ENDPOINT,
  CLIENT_ID,
  DEFAULT_SCOPES,
  getRedirectUri,
  CLIENT_SECRET,
} from '@/config';
import { useToken } from '@/context/TokenContext';
import { tokenService } from '@/services';
import { generateKeyPair } from '@/services/dpop.service';
import { jwkThumbprint } from '@/services/crypto-utils';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { useTraces } from '@/hooks/useTraces';
import { authorizationCodeProgress, twoStepProgress } from '@/utils/flow-progress';
import { TabBar } from '@/components/ui/TabBar';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TokenOutcome } from '@/components/ui/TokenOutcome';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { SplitPane } from '@/components/ui/SplitPane';
import { RequestBuilder } from '@/components/ui/RequestBuilder';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { AuthorizeRequestBuilder } from './AuthorizeRequestBuilder';
import { getDoc } from '@/data/operationDocs';
import { KeyRound, ArrowRightLeft, LogIn, RefreshCw, FileText } from 'lucide-react';
import type { TokenResponse } from '@/types';
import { SESSION_KEYS, readKey, writeKey, removeKey, clearDpopKeys } from '@/services/session-keys';
import { navigateTo } from '@/services/trace-store';

type GrantType =
  'authorization_code' | 'client_credentials' | 'password' | 'refresh_token' | 'jwt_bearer';

const GRANTS: { value: GrantType; label: string }[] = [
  { value: 'authorization_code', label: 'Auth Code (PKCE)' },
  { value: 'client_credentials', label: 'Client Credentials' },
  { value: 'password', label: 'Password (ROPC)' },
  { value: 'refresh_token', label: 'Refresh Token' },
  { value: 'jwt_bearer', label: 'JWT Bearer (RFC 7523)' },
];

/**
 * The preview must be the request, so these mirror `postWithOptionalBasic` in `token.service.ts`.
 *
 * The three secret-bearing grants used to render an `Authorization: Basic` header unconditionally,
 * which was faithful to a service that also sent one unconditionally — and both were wrong for a
 * public client, which is refused with `[A157303]` for presenting client-auth data at all. If the
 * service's rule changes again, change it here in the same commit: a preview that disagrees with the
 * wire is worse than no preview, because it is the thing people read instead of the request.
 */
const FORM_CONTENT_TYPE = { 'Content-Type': 'application/x-www-form-urlencoded' };

function basicOrNone(clientId: string, clientSecret: string): Record<string, string> {
  if (!clientSecret) return FORM_CONTENT_TYPE;
  return { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, ...FORM_CONTENT_TYPE };
}

function clientIdParam(clientId: string, clientSecret: string): string {
  return clientSecret ? '' : `&client_id=${encodeURIComponent(clientId)}`;
}

const grantIcons: Record<GrantType, React.ReactNode> = {
  authorization_code: <KeyRound className="h-4 w-4" />,
  client_credentials: <ArrowRightLeft className="h-4 w-4" />,
  password: <LogIn className="h-4 w-4" />,
  refresh_token: <RefreshCw className="h-4 w-4" />,
  jwt_bearer: <FileText className="h-4 w-4" />,
};

/**
 * Each step says what happens there, not only what it is called.
 *
 * `FlowDiagram` has always accepted a `description` and no call site ever passed one, so this diagram
 * was five bare words. Which channel a step uses is stated wherever it differs, because front channel
 * versus back channel is the structural idea the flow exists to teach and it is invisible in a row of
 * labels.
 */
const flowSteps: Record<GrantType, { id: string; label: string; description?: string }[]> = {
  authorization_code: [
    {
      id: 'authz',
      label: 'Authorize',
      description: 'Front channel: the browser leaves for the authorization endpoint.',
    },
    {
      id: 'login',
      label: 'Login',
      description: 'The End-User authenticates at the server, not in this app.',
    },
    { id: 'consent', label: 'Consent', description: 'They approve the scopes being requested.' },
    {
      id: 'callback',
      label: 'Callback',
      description: 'Front channel: a redirect brings a one-time code back.',
    },
    {
      id: 'token',
      label: 'Token',
      description: 'Back channel: the code plus the PKCE verifier are exchanged for tokens.',
    },
  ],
  client_credentials: [
    {
      id: 'auth',
      label: 'Authenticate',
      description: 'The client proves who it is. No user is involved.',
    },
    { id: 'token', label: 'Token', description: 'A token for the client itself, with no subject.' },
  ],
  password: [
    {
      id: 'creds',
      label: 'Credentials',
      description: 'The user hands their password to the client — why ROPC is discouraged.',
    },
    { id: 'token', label: 'Token', description: 'The client forwards them to the token endpoint.' },
  ],
  refresh_token: [
    {
      id: 'verify',
      label: 'Verify Token',
      description: 'A refresh token from an earlier grant is presented.',
    },
    {
      id: 'refresh',
      label: 'Refresh',
      description: 'A fresh access token, without sending the user back.',
    },
  ],
  jwt_bearer: [
    {
      id: 'sign',
      label: 'Sign JWT',
      description: 'An assertion is signed with a key the client registered.',
    },
    {
      id: 'exchange',
      label: 'Exchange',
      description: 'RFC 7523: the assertion stands in for an interactive grant.',
    },
  ],
};

const AuthFlowsSection: React.FC = () => {
  const { tokenSet, setTokenSet } = useToken();
  const [grantType, setGrantType] = useState<GrantType>('authorization_code');
  const { loading, result, error, call } = useAsyncCall<TokenResponse>();
  const displayResult = result || tokenSet;

  /**
   * Whether a FAPI signing key is sitting in this session — because if one is, the code exchange in
   * `CallbackPage` takes its `private_key_jwt` branch and sends `client_assertion` instead of whatever
   * is configured here. For a public client that is client-authentication data, refused with
   * `[A157303]`, and *nothing on this screen used to say so*: the key is written by the FAPI section
   * and read only by the callback. `clearTokens()` clears it, which made the mode resettable but not
   * visible — and a mode you cannot see is the thing that costs an afternoon.
   */
  const [signingKeyPresent, setSigningKeyPresent] = useState(() =>
    Boolean(readKey(SESSION_KEYS.fapiSigningKey)),
  );
  const forgetSigningKey = () => {
    removeKey(SESSION_KEYS.fapiSigningKey);
    removeKey(SESSION_KEYS.fapiSigningPublicKey);
    setSigningKeyPresent(false);
    toast.success('Signing key forgotten — the exchange will use this section\u2019s settings');
  };

  const [acId, setAcId] = useState(CLIENT_ID);
  const [acSecret, setAcSecret] = useState(CLIENT_SECRET);
  const [acRedirectUri, setAcRedirectUri] = useState(getRedirectUri());
  // `scope` used to come straight from the build-time constant with no input at all, which made the
  // single most-edited parameter in OAuth the one parameter this panel could not change.
  const [acScope, setAcScope] = useState(DEFAULT_SCOPES);
  /**
   * DPoP is now a choice. It used to be unconditional: `startAuthCode` always minted a key and the
   * callback always sent a proof, so every token from this panel came back sender-constrained
   * (`token_type: DPoP`) with nothing saying so — and the UserInfo and Grant Management sections then
   * presented it as `Bearer`, which RFC 9449 §7.2 requires the resource server to refuse. The default
   * flow produced a token half the app could not use.
   */
  const [acUseDpop, setAcUseDpop] = useState(false);
  const [acDpopThumbprint, setAcDpopThumbprint] = useState<string | undefined>(undefined);

  const [ccId, setCcId] = useState(CLIENT_ID);
  const [ccSecret, setCcSecret] = useState(CLIENT_SECRET);
  const [ccScope, setCcScope] = useState(DEFAULT_SCOPES);

  const [pwUser, setPwUser] = useState('');
  const [pwPass, setPwPass] = useState('');
  const [pwId, setPwId] = useState(CLIENT_ID);
  const [pwSecret, setPwSecret] = useState(CLIENT_SECRET);
  const [pwScope, setPwScope] = useState(DEFAULT_SCOPES);

  const [rtToken, setRtToken] = useState(tokenSet?.refresh_token || '');
  const [rtId, setRtId] = useState(CLIENT_ID);
  const [rtSecret, setRtSecret] = useState(CLIENT_SECRET);

  const [jwtAssertion, setJwtAssertion] = useState('');
  const [jwtId, setJwtId] = useState(CLIENT_ID);
  const [jwtSecret, setJwtSecret] = useState(CLIENT_SECRET);
  const [jwtScope, setJwtScope] = useState(DEFAULT_SCOPES);

  const doc = getDoc('auth-flows', grantType);

  /**
   * Progress read out of the request trace rather than tracked in state.
   *
   * `FlowDiagram` has always supported `completedSteps` and no call site ever passed one, so every step
   * was drawn pending and the diagram jumped straight to the last once a token existed. Deriving it from
   * the traffic means the diagram cannot claim a step that produced no request, and it survives the
   * authorization redirect — which takes the user out of this page entirely and brings them back.
   */
  const traces = useTraces();
  const progress = useMemo(() => {
    const hasToken = Boolean(displayResult);
    if (grantType === 'authorization_code') {
      return authorizationCodeProgress({
        traces,
        hasToken,
        codeReceived: Boolean(readKey(SESSION_KEYS.pkceVerifier)) && hasToken,
        authorizeSent: Boolean(readKey(SESSION_KEYS.oauthState)),
      });
    }
    return twoStepProgress({ traces, hasToken }, flowSteps[grantType][0].id);
  }, [traces, displayResult, grantType]);

  /**
   * Record which client the current token belongs to — and **clear the secret when there isn't one**.
   *
   * This was `if (clientSecret) writeKey(...)` with no else branch, so emptying the field left the
   * previous run's secret in session storage. Sections that pre-fill from `activeClientSecret` then
   * offered a credential the user had deliberately removed. Same shape, same cause and same fix as
   * `sendAuthorizeRequest` below; a write with no else branch is exactly the invisible mode that
   * `session-keys.ts` was created to end.
   */
  const saveClientCredentials = (clientId: string, clientSecret: string) => {
    writeKey(SESSION_KEYS.activeClientId, clientId);
    if (clientSecret) writeKey(SESSION_KEYS.activeClientSecret, clientSecret);
    else removeKey(SESSION_KEYS.activeClientSecret);
  };

  const handleCall = async (
    clientId: string,
    clientSecret: string,
    fn: () => Promise<TokenResponse>,
  ) => {
    const { data, error: err } = await call(fn);
    if (data) {
      setTokenSet(data);
      saveClientCredentials(clientId, clientSecret);
      toast.success('Token obtained successfully');
    } else {
      toast.error(err);
    }
  };

  /**
   * Generate the DPoP key when the box is ticked, so `dpop_jkt` can be offered to the builder.
   *
   * RFC 9449 §10 binds the *authorization code* to the key, which closes the window in which a stolen
   * code could be redeemed by somebody else — so the thumbprint belongs in the authorization request,
   * not just at the token endpoint.
   */
  const toggleDpop = async (enabled: boolean) => {
    setAcUseDpop(enabled);
    if (!enabled) {
      setAcDpopThumbprint(undefined);
      // Also drops the cached `DPoP-Nonce`: a nonce is bound to the key that was proving possession,
      // so keeping it past the key it belonged to can only mislead the next request.
      clearDpopKeys();
      return;
    }
    try {
      const pair = await generateKeyPair();
      writeKey(SESSION_KEYS.dpopPrivateKey, JSON.stringify(pair.privateKey));
      writeKey(SESSION_KEYS.dpopPublicKey, JSON.stringify(pair.publicKey));
      /**
       * **Two different values, and this line is where they used to be one.**
       *
       * `kid` identifies the key and is what `generateP256KeyPair` derives — the digest of the exported
       * JWK, `key_ops` and `ext` and all. `dpop_jkt` is the **RFC 7638 thumbprint**, computed over
       * `crv`/`kty`/`x`/`y` alone in lexicographic order, and RFC 9449 §10 makes a mismatch a MUST
       * reject: *"the authorization server computes the JWK Thumbprint of the proof-of-possession
       * public key in the DPoP proof and verifies that it matches the `dpop_jkt` parameter value in the
       * authorization request. If they do not match, it MUST reject the request."*
       *
       * `setAcDpopThumbprint(pair.kid)` was here, which is a plausible-looking wrong answer: both are
       * base64url SHA-256 digests of "the key". It never broke anything only because `dpop_jkt` was
       * never actually reaching the request. Do not collapse these two lines back together.
       */
      writeKey(SESSION_KEYS.dpopKid, pair.kid);
      setAcDpopThumbprint(await jwkThumbprint(pair.publicKey));
    } catch (e: unknown) {
      setAcUseDpop(false);
      toast.error(e instanceof Error ? e.message : 'Failed to generate a DPoP key');
    }
  };

  /**
   * Persist what the callback will need, then navigate to the URL the builder actually shows.
   *
   * The verifier arrives from the builder rather than being generated here, because the challenge in
   * the URL is the builder's — regenerating one here would guarantee a mismatch. A `null` verifier
   * means the user edited the challenge by hand, so there is no matching verifier to store and the
   * exchange is *meant* to fail.
   */
  const sendAuthorizeRequest = (
    url: string,
    ctx: { codeVerifier: string | null; state: string | null },
  ) => {
    if (ctx.codeVerifier) writeKey(SESSION_KEYS.pkceVerifier, ctx.codeVerifier);
    else removeKey(SESSION_KEYS.pkceVerifier);

    if (ctx.state) writeKey(SESSION_KEYS.oauthState, ctx.state);
    else removeKey(SESSION_KEYS.oauthState);

    writeKey(SESSION_KEYS.authzClientId, acId);
    /**
     * An emptied secret field must *remove* the stored secret, not leave the last one behind.
     *
     * With the old `if (acSecret) writeKey(...)` and no else branch, running the flow once with a
     * confidential client and then clearing the field meant `CallbackPage` still read a secret —
     * `readKey(authzClientSecret) || CLIENT_SECRET` — and sent `client_secret` for a client whose
     * method is `none`. Authlete refuses that with `[A157303]`, and the field the user was looking at
     * was empty. Absence has to be written down to be absent.
     */
    if (acSecret) writeKey(SESSION_KEYS.authzClientSecret, acSecret);
    else removeKey(SESSION_KEYS.authzClientSecret);

    navigateTo(url, 'authorize — front channel, browser leaves for the authorization endpoint');
  };

  const requestPreview = useMemo(() => {
    switch (grantType) {
      case 'authorization_code':
        // No preview here. `AuthorizeRequestBuilder` renders the real URL, built from the same object
        // it navigates to — the hand-assembled string that used to sit here omitted `state`, `nonce`
        // and `code_challenge`, so it showed an approximation of the request and never the request.
        return null;
      case 'client_credentials':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: basicOrNone(ccId, ccSecret),
          body: `grant_type=client_credentials&scope=${encodeURIComponent(ccScope)}${clientIdParam(ccId, ccSecret)}`,
        };
      case 'password':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: basicOrNone(pwId, pwSecret),
          body: `grant_type=password&username=${encodeURIComponent(pwUser)}&password=${encodeURIComponent(pwPass)}&scope=${encodeURIComponent(pwScope)}${clientIdParam(pwId, pwSecret)}`,
        };
      case 'refresh_token':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: basicOrNone(rtId, rtSecret),
          body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(rtToken)}${clientIdParam(rtId, rtSecret)}`,
        };
      case 'jwt_bearer':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(jwtId && jwtSecret
              ? { Authorization: `Basic ${btoa(`${jwtId}:${jwtSecret}`)}` }
              : {}),
          },
          body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtAssertion ? '<signed_jwt>' : '<empty>'}${jwtScope ? `&scope=${encodeURIComponent(jwtScope)}` : ''}`,
        };
    }
  }, [
    grantType,
    ccId,
    ccSecret,
    ccScope,
    pwUser,
    pwPass,
    pwId,
    pwSecret,
    pwScope,
    rtToken,
    rtId,
    rtSecret,
    jwtAssertion,
    jwtId,
    jwtSecret,
    jwtScope,
  ]);

  return (
    <SectionPanel
      title="Authorization Flows"
      description="Test OAuth 2.0 grant types against the Authlete authorization server"
      icon={grantIcons[grantType]}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabBar options={GRANTS} value={grantType} onChange={setGrantType} />
        </div>

        <FlowDiagram
          steps={flowSteps[grantType]}
          currentStep={progress.currentStep}
          completedSteps={progress.completedSteps}
          className="py-2"
        />

        {error && <ErrorExplainer error={error} />}

        {doc && <OperationDescription doc={doc} />}

        <SplitPane
          leftLabel="Configuration"
          rightLabel={displayResult ? 'Response' : ''}
          left={
            <div className="space-y-4">
              {grantType === 'authorization_code' && (
                <div className="space-y-3">
                  {signingKeyPresent && (
                    <div className="rounded-lg border border-edge-warning bg-tint-warning p-3 space-y-2">
                      <p className="text-xs text-warning-text">
                        A <strong>FAPI signing key</strong> is stored in this session, so the token
                        exchange will authenticate with <code>private_key_jwt</code> —{' '}
                        <code>client_assertion</code> instead of the credentials below. For a public
                        client that is refused with <code>[A157303]</code>.
                      </p>
                      <Button size="sm" variant="secondary" onClick={forgetSigningKey}>
                        Forget the signing key
                      </Button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Client ID"
                      value={acId}
                      onChange={(e) => setAcId(e.target.value)}
                      placeholder="Client identifier registered in Authlete"
                    />
                    <Input
                      label="Client Secret"
                      type="password"
                      value={acSecret}
                      onChange={(e) => setAcSecret(e.target.value)}
                      placeholder="Used at the token endpoint, not here"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Redirect URI"
                      value={acRedirectUri}
                      onChange={(e) => setAcRedirectUri(e.target.value)}
                      placeholder="Must match a registered redirect URI"
                    />
                    <Input
                      label="Scope"
                      value={acScope}
                      onChange={(e) => setAcScope(e.target.value)}
                      placeholder="openid profile email"
                    />
                  </div>

                  <label className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acUseDpop}
                      onChange={(e) => void toggleDpop(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-500 mt-0.5 shrink-0 cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      <span className="text-foreground font-medium">
                        Sender-constrain with DPoP
                      </span>{' '}
                      (RFC 9449) — generates a key, sends its thumbprint as{' '}
                      <code className="text-accent-text">dpop_jkt</code>, and proves possession at
                      the token endpoint. The token comes back as{' '}
                      <code className="text-accent-text">token_type: DPoP</code> and must then be
                      presented with the <code className="text-accent-text">DPoP</code> scheme,
                      never <code className="text-accent-text">Bearer</code>.
                    </span>
                  </label>

                  <AuthorizeRequestBuilder
                    endpoint={AUTHORIZATION_ENDPOINT}
                    seed={{ clientId: acId, redirectUri: acRedirectUri, scope: acScope }}
                    dpopThumbprint={acUseDpop ? acDpopThumbprint : undefined}
                    onSend={sendAuthorizeRequest}
                  />
                </div>
              )}

              {grantType === 'client_credentials' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Client ID"
                      value={ccId}
                      onChange={(e) => setCcId(e.target.value)}
                      placeholder="Your registered client ID"
                    />
                    <Input
                      label="Client Secret"
                      type="password"
                      value={ccSecret}
                      onChange={(e) => setCcSecret(e.target.value)}
                      placeholder="Keep this confidential"
                    />
                  </div>
                  <Input
                    label="Scope"
                    value={ccScope}
                    onChange={(e) => setCcScope(e.target.value)}
                    placeholder="e.g. openid profile email"
                  />
                  <Button
                    onClick={() =>
                      handleCall(ccId, ccSecret, () =>
                        tokenService.clientCredentials(ccId, ccSecret, ccScope),
                      )
                    }
                    loading={loading}
                    className="w-full sm:w-auto"
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Get Token
                  </Button>
                </div>
              )}

              {grantType === 'password' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Username"
                      value={pwUser}
                      onChange={(e) => setPwUser(e.target.value)}
                      placeholder="e.g. admin"
                    />
                    <Input
                      label="Password"
                      type="password"
                      value={pwPass}
                      onChange={(e) => setPwPass(e.target.value)}
                      placeholder="User password"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Client ID"
                      value={pwId}
                      onChange={(e) => setPwId(e.target.value)}
                      placeholder="Your registered client ID"
                    />
                    <Input
                      label="Client Secret"
                      type="password"
                      value={pwSecret}
                      onChange={(e) => setPwSecret(e.target.value)}
                      placeholder="Client secret for confidential clients"
                    />
                  </div>
                  <Input
                    label="Scope"
                    value={pwScope}
                    onChange={(e) => setPwScope(e.target.value)}
                    placeholder="e.g. openid profile email"
                  />
                  <Button
                    onClick={() =>
                      handleCall(pwId, pwSecret, () =>
                        tokenService.passwordGrant(pwUser, pwPass, pwId, pwSecret, pwScope),
                      )
                    }
                    loading={loading}
                    className="w-full sm:w-auto"
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Get Token
                  </Button>
                </div>
              )}

              {grantType === 'refresh_token' && (
                <div className="space-y-3">
                  <Input
                    label="Refresh Token"
                    value={rtToken}
                    onChange={(e) => setRtToken(e.target.value)}
                    placeholder="Paste a refresh token from a previous flow"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Client ID"
                      value={rtId}
                      onChange={(e) => setRtId(e.target.value)}
                      placeholder="Your registered client ID"
                    />
                    <Input
                      label="Client Secret"
                      type="password"
                      value={rtSecret}
                      onChange={(e) => setRtSecret(e.target.value)}
                      placeholder="Client secret for confidential clients"
                    />
                  </div>
                  <Button
                    onClick={() =>
                      handleCall(rtId, rtSecret, () =>
                        tokenService.refreshToken(rtToken, rtId, rtSecret),
                      )
                    }
                    loading={loading}
                    className="w-full sm:w-auto"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Token
                  </Button>
                </div>
              )}

              {grantType === 'jwt_bearer' && (
                <div className="space-y-3">
                  <Input
                    label="Signed JWT Assertion"
                    value={jwtAssertion}
                    onChange={(e) => setJwtAssertion(e.target.value)}
                    placeholder="Paste a signed JWT (RS256, ES256, etc.)"
                  />
                  <Input
                    label="Scope"
                    value={jwtScope}
                    onChange={(e) => setJwtScope(e.target.value)}
                    placeholder="e.g. openid profile email (optional)"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Client ID"
                      value={jwtId}
                      onChange={(e) => setJwtId(e.target.value)}
                      placeholder="Your registered client ID"
                    />
                    <Input
                      label="Client Secret"
                      type="password"
                      value={jwtSecret}
                      onChange={(e) => setJwtSecret(e.target.value)}
                      placeholder="Client secret (optional)"
                    />
                  </div>
                  {/* `disabled` reads `loading` directly — it was `loading !== null`, and this hook's
                      `loading` is a boolean, so the button could never enable and the RFC 7523 grant
                      was unreachable. See the note in StepUpSection: same idiom, same cause. */}
                  <Button
                    onClick={() =>
                      handleCall(jwtId, jwtSecret, () =>
                        tokenService.jwtBearerGrant(
                          jwtAssertion,
                          jwtId || undefined,
                          jwtSecret || undefined,
                          jwtScope || undefined,
                        ),
                      )
                    }
                    loading={loading}
                    disabled={!jwtAssertion || loading}
                    className="w-full sm:w-auto"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Exchange JWT for Token
                  </Button>
                  <p className="text-2xs text-muted-foreground">
                    The JWT must be signed with a key registered to the client (RS256 or ES256)
                  </p>
                </div>
              )}

              {requestPreview && (
                <RequestBuilder
                  method={requestPreview.method}
                  url={requestPreview.url}
                  headers={requestPreview.headers}
                  body={'body' in requestPreview ? requestPreview.body : undefined}
                />
              )}
            </div>
          }
          right={
            displayResult ? (
              /* Was a bare `JsonBlock`. The flow completed and the tool went quiet — no statement of
                 what was now held, no inspector for the ID token it had just obtained, and nothing
                 saying where to spend it. See `TokenOutcome`. */
              <TokenOutcome tokens={displayResult} />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[120px] rounded-lg border border-dashed border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">Run a flow to see the response here</p>
              </div>
            )
          }
        />
      </div>
    </SectionPanel>
  );
};

export default AuthFlowsSection;
