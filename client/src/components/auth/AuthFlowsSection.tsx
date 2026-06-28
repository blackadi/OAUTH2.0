import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { AUTHORIZATION_ENDPOINT, CLIENT_ID, DEFAULT_SCOPES, getRedirectUri, CLIENT_SECRET } from '@/config';
import { createPkcePair } from '@/pkce';
import { useToken } from '@/context/TokenContext';
import { tokenService } from '@/services';
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
import { getDoc } from '@/data/operationDocs';
import { KeyRound, ArrowRightLeft, LogIn, RefreshCw } from 'lucide-react';
import type { TokenResponse } from '@/types';

type GrantType = 'authorization_code' | 'client_credentials' | 'password' | 'refresh_token';

const GRANTS: { value: GrantType; label: string }[] = [
  { value: 'authorization_code', label: 'Auth Code (PKCE)' },
  { value: 'client_credentials', label: 'Client Credentials' },
  { value: 'password', label: 'Password (ROPC)' },
  { value: 'refresh_token', label: 'Refresh Token' },
];

const grantIcons: Record<GrantType, React.ReactNode> = {
  authorization_code: <KeyRound className="h-4 w-4" />,
  client_credentials: <ArrowRightLeft className="h-4 w-4" />,
  password: <LogIn className="h-4 w-4" />,
  refresh_token: <RefreshCw className="h-4 w-4" />,
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
};

const AuthFlowsSection: React.FC = () => {
  const { tokenSet, setTokenSet } = useToken();
  const [grantType, setGrantType] = useState<GrantType>('authorization_code');
  const { loading, result, error, call } = useAsyncCall<TokenResponse>();

  const [acId, setAcId] = useState(CLIENT_ID);
  const [acRedirectUri, setAcRedirectUri] = useState(getRedirectUri());

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

  const startAuthCode = async () => {
    try {
      const { codeVerifier, codeChallenge } = await createPkcePair();
      const state = crypto.randomUUID();
      const nonce = crypto.randomUUID();
      sessionStorage.setItem('pkce_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);
      sessionStorage.setItem('authz_client_id', acId);
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: acId,
        redirect_uri: acRedirectUri,
        scope: DEFAULT_SCOPES,
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      window.location.href = `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to initiate auth code flow';
      toast.error(msg);
    }
  };

  const requestPreview = useMemo(() => {
    switch (grantType) {
      case 'authorization_code':
        return {
          method: 'GET' as const,
          url: `${AUTHORIZATION_ENDPOINT}?response_type=code&client_id=${acId}&redirect_uri=${encodeURIComponent(acRedirectUri)}&scope=${DEFAULT_SCOPES}&code_challenge_method=S256`,
          headers: {} as Record<string, string>,
        };
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
    }
  }, [grantType, acId, acRedirectUri, ccId, ccSecret, ccScope, pwUser, pwPass, pwId, pwSecret, pwScope, rtToken, rtId, rtSecret]);

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
          currentStep={result ? 'token' : undefined}
          className="py-2"
        />

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {doc && <OperationDescription doc={doc} />}

        <SplitPane
          leftLabel="Configuration"
          rightLabel={result ? 'Response' : ''}
          left={
            <div className="space-y-4">
              {grantType === 'authorization_code' && (
                <div className="space-y-3">
                  <Input label="Client ID" value={acId} onChange={(e) => setAcId(e.target.value)} placeholder="Client identifier registered in Authlete" />
                  <Input label="Redirect URI" value={acRedirectUri} onChange={(e) => setAcRedirectUri(e.target.value)} placeholder="Must match a registered redirect URI" />
                  <div className="pt-1">
                    <Button onClick={startAuthCode} loading={loading} className="w-full sm:w-auto">
                      <KeyRound className="h-4 w-4 mr-2" />
                      Start Authorization Code Flow
                    </Button>
                    <p className="text-[0.6rem] text-muted-foreground mt-1.5">
                      You'll be redirected to the login page to authenticate
                    </p>
                  </div>
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

              <RequestBuilder
                method={requestPreview.method}
                url={requestPreview.url}
                headers={requestPreview.headers}
                body={'body' in requestPreview ? requestPreview.body : undefined}
              />
            </div>
          }
          right={
            result ? (
              <JsonBlock data={result} label="Token Response" />
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
