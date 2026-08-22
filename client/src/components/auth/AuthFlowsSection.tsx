import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { AUTHORIZATION_ENDPOINT, CLIENT_ID, DEFAULT_SCOPES, getRedirectUri, CLIENT_SECRET } from '@/config';
import { useToken } from '@/context/TokenContext';
import { tokenService } from '@/services';
import { generateKeyPair } from '@/services/dpop.service';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { SplitPane } from '@/components/ui/SplitPane';
import { RequestBuilder } from '@/components/ui/RequestBuilder';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { AuthorizeRequestBuilder } from './AuthorizeRequestBuilder';
import { getDoc } from '@/data/operationDocs';
import { KeyRound, ArrowRightLeft, LogIn, RefreshCw, FileText } from 'lucide-react';
import type { TokenResponse } from '@/types';

type GrantType = 'authorization_code' | 'client_credentials' | 'password' | 'refresh_token' | 'jwt_bearer';

const GRANTS: { value: GrantType; label: string }[] = [
  { value: 'authorization_code', label: 'Auth Code (PKCE)' },
  { value: 'client_credentials', label: 'Client Credentials' },
  { value: 'password', label: 'Password (ROPC)' },
  { value: 'refresh_token', label: 'Refresh Token' },
  { value: 'jwt_bearer', label: 'JWT Bearer (RFC 7523)' },
];

const grantIcons: Record<GrantType, React.ReactNode> = {
  authorization_code: <KeyRound className="h-4 w-4" />,
  client_credentials: <ArrowRightLeft className="h-4 w-4" />,
  password: <LogIn className="h-4 w-4" />,
  refresh_token: <RefreshCw className="h-4 w-4" />,
  jwt_bearer: <FileText className="h-4 w-4" />,
};

const flowSteps: Record<GrantType, { id: string; label: string }[]> = {
  authorization_code: [
    { id: 'authz', label: 'Authorize' },
    { id: 'login', label: 'Login' },
    { id: 'consent', label: 'Consent' },
    { id: 'callback', label: 'Callback' },
    { id: 'token', label: 'Token' },
  ],
  client_credentials: [
    { id: 'auth', label: 'Authenticate' },
    { id: 'token', label: 'Token' },
  ],
  password: [
    { id: 'creds', label: 'Credentials' },
    { id: 'token', label: 'Token' },
  ],
  refresh_token: [
    { id: 'verify', label: 'Verify Token' },
    { id: 'refresh', label: 'Refresh' },
  ],
  jwt_bearer: [
    { id: 'sign', label: 'Sign JWT' },
    { id: 'exchange', label: 'Exchange' },
  ],
};

const AuthFlowsSection: React.FC = () => {
  const { tokenSet, setTokenSet } = useToken();
  const [grantType, setGrantType] = useState<GrantType>('authorization_code');
  const { loading, result, error, call } = useAsyncCall<TokenResponse>();
  const displayResult = result || tokenSet;

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

  const saveClientCredentials = (clientId: string, clientSecret: string) => {
    sessionStorage.setItem('active_client_id', clientId);
    if (clientSecret) sessionStorage.setItem('active_client_secret', clientSecret);
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
      sessionStorage.removeItem('dpop_private_key');
      sessionStorage.removeItem('dpop_public_key');
      sessionStorage.removeItem('dpop_kid');
      return;
    }
    try {
      const pair = await generateKeyPair();
      sessionStorage.setItem('dpop_private_key', JSON.stringify(pair.privateKey));
      sessionStorage.setItem('dpop_public_key', JSON.stringify(pair.publicKey));
      sessionStorage.setItem('dpop_kid', pair.kid);
      setAcDpopThumbprint(pair.kid);
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
  const sendAuthorizeRequest = (url: string, ctx: { codeVerifier: string | null; state: string | null }) => {
    if (ctx.codeVerifier) sessionStorage.setItem('pkce_code_verifier', ctx.codeVerifier);
    else sessionStorage.removeItem('pkce_code_verifier');

    if (ctx.state) sessionStorage.setItem('oauth_state', ctx.state);
    else sessionStorage.removeItem('oauth_state');

    sessionStorage.setItem('authz_client_id', acId);
    if (acSecret) sessionStorage.setItem('authz_client_secret', acSecret);

    window.location.href = url;
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
          headers: {
            'Authorization': `Basic ${btoa(`${ccId}:${ccSecret}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `grant_type=client_credentials&scope=${encodeURIComponent(ccScope)}`,
        };
      case 'password':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: {
            'Authorization': `Basic ${btoa(`${pwId}:${pwSecret}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `grant_type=password&username=${encodeURIComponent(pwUser)}&password=${encodeURIComponent(pwPass)}&scope=${encodeURIComponent(pwScope)}`,
        };
      case 'refresh_token':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: {
            'Authorization': `Basic ${btoa(`${rtId}:${rtSecret}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(rtToken)}`,
        };
      case 'jwt_bearer':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(jwtId && jwtSecret ? { 'Authorization': `Basic ${btoa(`${jwtId}:${jwtSecret}`)}` } : {}),
          },
          body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtAssertion ? '<signed_jwt>' : '<empty>'}${jwtScope ? `&scope=${encodeURIComponent(jwtScope)}` : ''}`,
        };
    }
  }, [grantType, ccId, ccSecret, ccScope, pwUser, pwPass, pwId, pwSecret, pwScope, rtToken, rtId, rtSecret, jwtAssertion, jwtId, jwtSecret, jwtScope]);

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
          currentStep={displayResult ? 'token' : undefined}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Client ID" value={acId} onChange={(e) => setAcId(e.target.value)} placeholder="Client identifier registered in Authlete" />
                    <Input label="Client Secret" type="password" value={acSecret} onChange={(e) => setAcSecret(e.target.value)} placeholder="Used at the token endpoint, not here" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Redirect URI" value={acRedirectUri} onChange={(e) => setAcRedirectUri(e.target.value)} placeholder="Must match a registered redirect URI" />
                    <Input label="Scope" value={acScope} onChange={(e) => setAcScope(e.target.value)} placeholder="openid profile email" />
                  </div>

                  <label className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acUseDpop}
                      onChange={(e) => void toggleDpop(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-500 mt-0.5 shrink-0 cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      <span className="text-foreground font-medium">Sender-constrain with DPoP</span>{' '}
                      (RFC 9449) — generates a key, sends its thumbprint as{' '}
                      <code className="text-indigo-300">dpop_jkt</code>, and proves possession at the
                      token endpoint. The token comes back as{' '}
                      <code className="text-indigo-300">token_type: DPoP</code> and must then be
                      presented with the <code className="text-indigo-300">DPoP</code> scheme, never{' '}
                      <code className="text-indigo-300">Bearer</code>.
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
                    <Input label="Client ID" value={ccId} onChange={(e) => setCcId(e.target.value)} placeholder="Your registered client ID" />
                    <Input label="Client Secret" type="password" value={ccSecret} onChange={(e) => setCcSecret(e.target.value)} placeholder="Keep this confidential" />
                  </div>
                  <Input label="Scope" value={ccScope} onChange={(e) => setCcScope(e.target.value)} placeholder="e.g. openid profile email" />
                  <Button onClick={() => handleCall(ccId, ccSecret, () => tokenService.clientCredentials(ccId, ccSecret, ccScope))} loading={loading} className="w-full sm:w-auto">
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Get Token
                  </Button>
                </div>
              )}

              {grantType === 'password' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Username" value={pwUser} onChange={(e) => setPwUser(e.target.value)} placeholder="e.g. admin" />
                    <Input label="Password" type="password" value={pwPass} onChange={(e) => setPwPass(e.target.value)} placeholder="User password" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Client ID" value={pwId} onChange={(e) => setPwId(e.target.value)} placeholder="Your registered client ID" />
                    <Input label="Client Secret" type="password" value={pwSecret} onChange={(e) => setPwSecret(e.target.value)} placeholder="Client secret for confidential clients" />
                  </div>
                  <Input label="Scope" value={pwScope} onChange={(e) => setPwScope(e.target.value)} placeholder="e.g. openid profile email" />
                  <Button onClick={() => handleCall(pwId, pwSecret, () => tokenService.passwordGrant(pwUser, pwPass, pwId, pwSecret, pwScope))} loading={loading} className="w-full sm:w-auto">
                    <LogIn className="h-4 w-4 mr-2" />
                    Get Token
                  </Button>
                </div>
              )}

              {grantType === 'refresh_token' && (
                <div className="space-y-3">
                  <Input label="Refresh Token" value={rtToken} onChange={(e) => setRtToken(e.target.value)} placeholder="Paste a refresh token from a previous flow" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Client ID" value={rtId} onChange={(e) => setRtId(e.target.value)} placeholder="Your registered client ID" />
                    <Input label="Client Secret" type="password" value={rtSecret} onChange={(e) => setRtSecret(e.target.value)} placeholder="Client secret for confidential clients" />
                  </div>
                  <Button onClick={() => handleCall(rtId, rtSecret, () => tokenService.refreshToken(rtToken, rtId, rtSecret))} loading={loading} className="w-full sm:w-auto">
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
                    <Input label="Client ID" value={jwtId} onChange={(e) => setJwtId(e.target.value)} placeholder="Your registered client ID" />
                    <Input label="Client Secret" type="password" value={jwtSecret} onChange={(e) => setJwtSecret(e.target.value)} placeholder="Client secret (optional)" />
                  </div>
                  {/* `disabled` reads `loading` directly — it was `loading !== null`, and this hook's
                      `loading` is a boolean, so the button could never enable and the RFC 7523 grant
                      was unreachable. See the note in StepUpSection: same idiom, same cause. */}
                  <Button onClick={() => handleCall(jwtId, jwtSecret, () => tokenService.jwtBearerGrant(jwtAssertion, jwtId || undefined, jwtSecret || undefined, jwtScope || undefined))} loading={loading} disabled={!jwtAssertion || loading} className="w-full sm:w-auto">
                    <FileText className="h-4 w-4 mr-2" />
                    Exchange JWT for Token
                  </Button>
                  <p className="text-[0.6rem] text-muted-foreground">
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
              <JsonBlock data={displayResult} label="Token Response" />
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
