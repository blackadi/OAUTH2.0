import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { parService } from '@/services';
import { AUTHORIZATION_ENDPOINT, PAR_ENDPOINT } from '@/config';
import { createPkcePair } from '@/pkce';
import { generateKeyPair, createProof } from '@/services/dpop.service';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

function ParSection() {
  const { loading, result, error, call } = useAsyncCall();
  const [parameters, setParameters] = useState(
    'response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3001/callback&scope=openid&state=par_state&code_challenge_method=S256&code_challenge=',
  );
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [useDpop, setUseDpop] = useState(false);
  const [parResult, setParResult] = useState<{ requestUri?: string; expiresIn?: number } | null>(null);
  const [pkceVerifier, setPkceVerifier] = useState('');
  const [authUrl, setAuthUrl] = useState('');

  const doc = getDoc('par', 'create');

  useEffect(() => {
    const stored = sessionStorage.getItem('pkce_code_verifier');
    if (stored) setPkceVerifier(stored);
  }, []);

  const handleGeneratePkce = useCallback(async () => {
    try {
      const pair = await createPkcePair();
      sessionStorage.setItem('pkce_code_verifier', pair.codeVerifier);
      setPkceVerifier(pair.codeVerifier);
      const state = crypto.randomUUID();
      sessionStorage.setItem('oauth_state', state);
      const params = new URLSearchParams();
      params.set('response_type', 'code');
      params.set('redirect_uri', 'http://localhost:3001/callback');
      params.set('scope', 'openid');
      params.set('state', state);
      params.set('code_challenge_method', 'S256');
      params.set('code_challenge', pair.codeChallenge);
      setParameters(params.toString());
      toast.success('PKCE + state generated and stored');
    } catch {
      toast.error('Failed to generate PKCE');
    }
  }, []);

  const doParRequest = async () => {
    if (useDpop) {
      let dpopKeyRaw = sessionStorage.getItem('dpop_private_key');
      if (!dpopKeyRaw) {
        const pair = await generateKeyPair();
        sessionStorage.setItem('dpop_private_key', JSON.stringify(pair.privateKey));
        sessionStorage.setItem('dpop_public_key', JSON.stringify(pair.publicKey));
        sessionStorage.setItem('dpop_kid', pair.kid);
        dpopKeyRaw = JSON.stringify(pair.privateKey);
      }
      const dpopPrivateKey = JSON.parse(dpopKeyRaw);
      const storedNonce = sessionStorage.getItem('dpop_nonce') || undefined;
      const proof = await createProof(dpopPrivateKey, 'POST', PAR_ENDPOINT, undefined, storedNonce);
      const { data, dpopNonce } = await parService.pushedAuthorizationWithDpop(
        { parameters, clientId, clientSecret },
        proof,
      );
      if (dpopNonce) sessionStorage.setItem('dpop_nonce', dpopNonce);
      return data;
    }
    return parService.pushedAuthorization({ parameters, clientId, clientSecret });
  };

  const handlePush = async () => {
    const { data, error: err } = await call(doParRequest);
    if (data) {
      const d = data as { requestUri?: string; expiresIn?: number };
      setParResult(d);
      toast.success('PAR request completed');
    } else {
      toast.error(err);
    }
  };

  const handlePushAndRedirect = async () => {
    const { data, error: err } = await call(doParRequest);
    if (data) {
      const d = data as { requestUri?: string };
      if (d?.requestUri) {
        const cid = clientId || parameters.match(/client_id=([^&]+)/)?.[1] || '';
        window.location.href = `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(cid)}&request_uri=${encodeURIComponent(d.requestUri)}`;
      }
    } else {
      toast.error(err);
    }
  };

  useEffect(() => {
    const cid = clientId || parameters.match(/client_id=([^&]+)/)?.[1] || '';
    if (parResult?.requestUri && cid) {
      setAuthUrl(`${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(cid)}&request_uri=${encodeURIComponent(parResult.requestUri)}`);
    } else {
      setAuthUrl('');
    }
  }, [parResult, clientId, parameters]);

  const handleRedirectToAuthorize = () => {
    if (authUrl) window.location.href = authUrl;
  };

  const handleReset = () => {
    setParResult(null);
    setAuthUrl('');
  };

  return (
    <SectionPanel title="Pushed Authorization Requests (RFC 9126)" description="Send authorization parameters via POST for a cleaner redirect">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {doc && <OperationDescription doc={doc} />}

      <div className="space-y-3">
        <Textarea label="Parameters (URL-encoded)" rows={4} value={parameters} onChange={(e) => setParameters(e.target.value)} placeholder="response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3001/callback&scope=openid&state=...&code_challenge=..." />

        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={handleGeneratePkce} size="sm">Generate PKCE + State</Button>
          {pkceVerifier && <span className="text-xs text-slate-400 self-center truncate max-w-[200px]" title={pkceVerifier}>verifier: {pkceVerifier.slice(0, 20)}...</span>}
        </div>

        <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="your_client_id" />
        <Input label="Client Secret (omit for public clients)" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="your_client_secret" />

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={useDpop} onChange={(e) => setUseDpop(e.target.checked)} className="accent-blue-500 w-4 h-4" />
          Use DPoP (sender-constrained token binding)
        </label>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={handlePush} loading={loading}>
            Push Authorization Request
          </Button>
          {parResult?.requestUri && (
            <>
              <Button onClick={handleRedirectToAuthorize}>
                Authorize (redirect)
              </Button>
              <Button variant="secondary" onClick={handlePushAndRedirect} loading={loading}>
                Push + Authorize
              </Button>
              <Button variant="secondary" onClick={handleReset} size="sm">
                Reset
              </Button>
            </>
          )}
        </div>
      </div>

      {parResult?.requestUri && (
        <div className="mt-4 p-3 bg-slate-800 rounded-lg border border-slate-700 space-y-2">
          <p className="text-xs text-slate-300 font-mono break-all">
            <span className="text-slate-500">request_uri: </span>
            {parResult.requestUri}
          </p>
          <p className="text-xs text-slate-400">
            Expires in: {parResult.expiresIn ?? '~600'}s &nbsp;|&nbsp;
            Auth URL: <a href={authUrl} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">{authUrl}</a>
          </p>
        </div>
      )}

      {result !== null && !parResult && <JsonBlock data={result} label="Response" />}
      {parResult && <JsonBlock data={parResult} label="PAR Response" />}
    </SectionPanel>
  );
}

export { ParSection };
