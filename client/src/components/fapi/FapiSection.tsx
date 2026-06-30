import { useState } from 'react';
import { toast } from 'sonner';
import { fapiService, parService, tokenService } from '@/services';
import { useAsyncCall, useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { generateKeyPair, createProof, computeAth, type DPoPKeyPair } from '@/services/dpop.service';
import { useToken } from '@/context/TokenContext';
import { CLIENT_ID, CLIENT_SECRET, DEFAULT_SCOPES, PAR_ENDPOINT, AUTHORIZATION_ENDPOINT, USERINFO_ENDPOINT, getRedirectUri } from '@/config';
import { createPkcePair } from '@/pkce';

interface FapiConfig {
  mode: string;
  dpopEnabled: boolean;
  requiredClientAuth: string;
  senderConstrainedTokens: string;
  parRequired: boolean;
  pkceRequired: boolean;
  refreshTokenRotation: boolean;
  scopeRequired: boolean;
}

function FapiSection() {
  const { loading, error, call } = useAsyncCall();
  const { getAccessToken } = useToken();

  const [configData, setConfigData] = useState<FapiConfig | null>(null);
  const [statusData, setStatusData] = useState<Record<string, unknown> | null>(null);

  const [keyPair, setKeyPair] = useState<DPoPKeyPair | null>(null);
  const [proofHtm, setProofHtm] = useState('POST');
  const [proofHtu, setProofHtu] = useState('http://localhost:3000/api/token');
  const [proofAt, setProofAt] = useState('');
  const [proofNonce, setProofNonce] = useState('');
  const [proofJwt, setProofJwt] = useState('');

  // Wizard state
  const [wizClientId, setWizClientId] = useState(CLIENT_ID);
  const [wizClientSecret, setWizClientSecret] = useState(CLIENT_SECRET);
  const [wizRedirectUri, setWizRedirectUri] = useState(getRedirectUri());
  const [wizScopes, setWizScopes] = useState(DEFAULT_SCOPES);
  const [wizKeyPair, setWizKeyPair] = useState<DPoPKeyPair | null>(null);
  const [wizParResult, setWizParResult] = useState<{requestUri?: string; expiresIn?: number} | null>(null);
  const [wizUserinfoResult, setWizUserinfoResult] = useState<Record<string, unknown> | null>(null);
  const wizAsync = useDiscriminatedAsyncCall<string>();
  const { loading: wizLoading, error: wizError, call: wizCall } = wizAsync;

  const configDoc = getDoc('fapi', 'config');
  const statusDoc = getDoc('fapi', 'status');

  const fetchConfig = async () => {
    const { data } = await call(() => fapiService.getConfig());
    if (data) {
      setConfigData(data as FapiConfig);
      toast.success('FAPI config loaded');
    }
  };

  const fetchStatus = async () => {
    const { data } = await call(() => fapiService.getStatus());
    if (data) {
      setStatusData(data as Record<string, unknown>);
      toast.success('FAPI status loaded');
    }
  };

  const handleGenerateKey = async () => {
    try {
      const kp = await generateKeyPair();
      setKeyPair(kp);
      toast.success('DPoP key pair generated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate key pair');
    }
  };

  const handleCreateProof = async () => {
    if (!keyPair) {
      toast.error('Generate a DPoP key pair first');
      return;
    }
    try {
      const jwt = await createProof(
        keyPair.privateKey,
        proofHtm,
        proofHtu,
        proofAt || undefined,
        proofNonce || undefined,
      );
      setProofJwt(jwt);
      toast.success('DPoP proof created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create proof');
    }
  };

  // Wizard handlers
  const handleWizGenerateKey = async () => {
    const { error } = await wizCall('setup', async () => {
      const kp = await generateKeyPair();
      sessionStorage.setItem('dpop_private_key', JSON.stringify(kp.privateKey));
      sessionStorage.setItem('dpop_public_key', JSON.stringify(kp.publicKey));
      sessionStorage.setItem('dpop_kid', kp.kid);
      sessionStorage.setItem('authz_client_id', wizClientId);
      sessionStorage.setItem('authz_client_secret', wizClientSecret);
      setWizKeyPair(kp);
    });
    if (error) { toast.error(error); return; }
    toast.success('DPoP key pair generated');
  };

  const handleWizPar = async () => {
    const { error } = await wizCall('par', async () => {
      const pkce = await createPkcePair();
      sessionStorage.setItem('pkce_code_verifier', pkce.codeVerifier);
      const state = crypto.randomUUID();
      sessionStorage.setItem('oauth_state', state);
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: wizClientId,
        redirect_uri: wizRedirectUri,
        scope: wizScopes,
        code_challenge: pkce.codeChallenge,
        code_challenge_method: 'S256',
        state,
      });
      const storedNonce = sessionStorage.getItem('dpop_nonce') || undefined;
      const proof = await createProof(
        wizKeyPair!.privateKey, 'POST', PAR_ENDPOINT, undefined, storedNonce,
      );
      const { data, dpopNonce } = await parService.pushedAuthorizationWithDpop(
        { parameters: params.toString() }, proof,
      );
      if (dpopNonce) sessionStorage.setItem('dpop_nonce', dpopNonce);
      setWizParResult(data as { requestUri?: string; expiresIn?: number });
    });
    if (error) { toast.error(error); return; }
    toast.success('PAR succeeded');
  };

  const handleWizAuthorize = () => {
    if (!wizParResult?.requestUri) return;
    const authorizeUrl = `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(wizClientId)}&request_uri=${encodeURIComponent(wizParResult.requestUri)}`;
    window.location.href = authorizeUrl;
  };

  const handleWizUserinfo = async () => {
    const { error } = await wizCall('userinfo', async () => {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('No access token stored in context. Complete the authorize step first.');
      const athValue = await computeAth(accessToken);
      const storedNonce = sessionStorage.getItem('dpop_nonce') || undefined;
      const proof = await createProof(
        wizKeyPair!.privateKey, 'POST', USERINFO_ENDPOINT, athValue, storedNonce,
      );
      const { data, dpopNonce } = await tokenService.userInfoWithDpop(accessToken, proof);
      if (dpopNonce) sessionStorage.setItem('dpop_nonce', dpopNonce);
      setWizUserinfoResult(data as Record<string, unknown>);
    });
    if (error) { toast.error(error); return; }
    toast.success('Userinfo fetched with DPoP');
  };

  return (
    <SectionPanel title="FAPI 2.0 & DPoP" description="FAPI 2.0 Security Profile compliance and DPoP sender-constrained token tools">
      {!!error && <p className="text-xs text-red-400">{String(error)}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>FAPI Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {configDoc && <OperationDescription doc={configDoc} />}
            <Button onClick={fetchConfig} loading={loading} size="sm">
              Fetch Config
            </Button>
            {configData != null && (
              <div className="flex flex-wrap gap-2 mt-2">
                {configData.mode !== 'disabled' ? (
                  <Badge variant="success">FAPI {configData.mode === 'ms' ? '+ Message Signing' : 'Security Profile'}</Badge>
                ) : (
                  <Badge variant="info">FAPI Disabled</Badge>
                )}
                {configData.dpopEnabled ? (
                  <Badge variant="success">DPoP Enabled</Badge>
                ) : (
                  <Badge variant="info">DPoP Disabled</Badge>
                )}
              </div>
            )}
            {configData ? <JsonBlock data={configData} label="Config" /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Authlete Live Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusDoc && <OperationDescription doc={statusDoc} />}
            <Button onClick={fetchStatus} loading={loading} size="sm">
              Fetch Status
            </Button>
            {statusData ? <JsonBlock data={statusData} label="Status" /> : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>DPoP Key Utilities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Button onClick={handleGenerateKey} loading={loading} size="sm">
              Generate DPoP Key Pair (ES256)
            </Button>
          </div>

          {keyPair && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <JsonBlock data={keyPair.publicKey} label="Public Key (JWK)" />
                <JsonBlock data={{ ...keyPair.privateKey, d: '***present***' }} label="Private Key (JWK, redacted)" />
              </div>

              <div className="border-t border-slate-800 pt-4">
                <h4 className="text-sm font-medium mb-3">Create DPoP Proof</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="HTTP Method (htm)" value={proofHtm} onChange={(e) => setProofHtm(e.target.value)} placeholder="POST" />
                  <Input label="HTTP URI (htu)" value={proofHtu} onChange={(e) => setProofHtu(e.target.value)} placeholder="http://localhost:3000/api/token" />
                  <Input label="ath (optional)" value={proofAt} onChange={(e) => setProofAt(e.target.value)} placeholder="base64url SHA-256 hash of access token" />
                  <Input label="Nonce (optional)" value={proofNonce} onChange={(e) => setProofNonce(e.target.value)} placeholder="server DPoP-Nonce" />
                </div>
                <div className="flex gap-2 mt-3">
                  <Button onClick={async () => {
                    const at = getAccessToken();
                    if (!at) { toast.error('No access token stored - get a token first'); return; }
                    const ath = await computeAth(at);
                    setProofAt(ath);
                    toast.success('ath computed from current access token');
                  }} size="sm" variant="secondary">
                    Compute ath from Token
                  </Button>
                  <Button onClick={handleCreateProof} loading={loading} size="sm">
                    Create DPoP Proof JWT
                  </Button>
                </div>
                {proofJwt && (
                  <div className="mt-3">
                    <Textarea label="DPoP Proof JWT" rows={3} value={proofJwt} readOnly />
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Test Flow (FAPI 2.0 + DPoP)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!!wizError && <p className="text-xs text-red-400">{String(wizError)}</p>}

          <div>
            <h4 className="text-sm font-medium mb-3">Step 1: Setup Client</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Input label="Client ID" value={wizClientId} onChange={(e) => setWizClientId(e.target.value)} placeholder="your_client_id" />
              <Input label="Client Secret" value={wizClientSecret} onChange={(e) => setWizClientSecret(e.target.value)} placeholder="your_client_secret" />
              <Input label="Redirect URI" value={wizRedirectUri} onChange={(e) => setWizRedirectUri(e.target.value)} placeholder="http://localhost:3001/callback" />
              <Input label="Scopes" value={wizScopes} onChange={(e) => setWizScopes(e.target.value)} placeholder="openid profile email" />
            </div>
            <Button onClick={handleWizGenerateKey} loading={wizLoading === 'setup'} size="sm">
              Generate DPoP Key Pair
            </Button>
            {wizKeyPair && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                <JsonBlock data={wizKeyPair.publicKey} label="Public Key (JWK)" />
                <JsonBlock data={{ ...wizKeyPair.privateKey, d: '***present***' }} label="Private Key (redacted)" />
              </div>
            )}
          </div>

          <div className={`border-t border-slate-800 pt-4 ${!wizKeyPair ? 'opacity-50 pointer-events-none' : ''}`}>
            <h4 className="text-sm font-medium mb-3">Step 2: Push Authorization Request (PAR)</h4>
            <p className="text-xs text-slate-400 mb-2">
              Sends the authorization parameters to the PAR endpoint with a DPoP proof. Also generates PKCE challenge and state for the callback.
            </p>
            <Button onClick={handleWizPar} loading={wizLoading === 'par'} size="sm" disabled={!wizKeyPair}>
              Push PAR
            </Button>
            {wizParResult && (
              <div className="mt-2">
                <JsonBlock data={wizParResult} label="PAR Response" />
              </div>
            )}
          </div>

          <div className={`border-t border-slate-800 pt-4 ${!wizParResult ? 'opacity-50 pointer-events-none' : ''}`}>
            <h4 className="text-sm font-medium mb-3">Step 3: Authorize</h4>
            <p className="text-xs text-slate-400 mb-2">
              Open the authorization page to log in and consent. After the redirect back to the callback page,
              your tokens will be stored. Then return here for Step 4.
            </p>
            <Button onClick={handleWizAuthorize} size="sm" variant="secondary" disabled={!wizParResult}>
              Open Authorize Page
            </Button>
          </div>

          <div className="border-t border-slate-800 pt-4">
            <h4 className="text-sm font-medium mb-3">Step 4: Call Userinfo with DPoP</h4>
            <p className="text-xs text-slate-400 mb-2">
              Uses the stored DPoP key and access token to call the userinfo endpoint.
              The DPoP proof includes the <code className="text-slate-300">ath</code> claim (hash of the access token).
            </p>
            <Button onClick={handleWizUserinfo} loading={wizLoading === 'userinfo'} size="sm">
              Call Userinfo with DPoP
            </Button>
            {wizUserinfoResult && (
              <div className="mt-2">
                <JsonBlock data={wizUserinfoResult} label="Userinfo Response" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </SectionPanel>
  );
}

export { FapiSection };
