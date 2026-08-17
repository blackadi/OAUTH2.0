import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { parService } from '@/services';
import { AUTHORIZATION_ENDPOINT, PAR_ENDPOINT } from '@/config';
import { createPkcePair } from '@/pkce';
import { generateKeyPair, createProof } from '@/services/dpop.service';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
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
  // Must match the client's registered auth method — Authlete checks the channel the
  // credentials arrive on, so the wrong choice is a 401. 'post' is the historical default
  // here and what Authlete gives DCR-created clients.
  const [authMethod, setAuthMethod] = useState<'post' | 'basic' | 'none'>('post');
  const [useDpop, setUseDpop] = useState(false);
  // Mirrors RFC 9126 §2.2's response body. The server returned Authlete's camelCase envelope until T1-11.
  const [parResult, setParResult] = useState<{ request_uri?: string; expires_in?: number } | null>(null);
  // Read once, lazily, at first render. This used to be an empty `useState` plus a mount effect that called
  // `setPkceVerifier` synchronously — which is a cascading render for a value that is known before the first
  // paint, and which `react-hooks` flags. Lazy initialisation is the same read with no second render.
  const [pkceVerifier, setPkceVerifier] = useState(() => sessionStorage.getItem('pkce_code_verifier') ?? '');

  const doc = getDoc('par', 'create');

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
    // basic -> Authorization: Basic header; post -> credentials in the JSON body, which the
    // server merges into the pushed `parameters`; none -> client_id only (public client).
    const basicAuth =
      authMethod === 'basic' && clientId ? { clientId, clientSecret } : undefined;
    // With Basic the secret travels in the header, so keep it out of the body entirely.
    const body =
      authMethod === 'basic'
        ? { parameters }
        : authMethod === 'none'
          ? { parameters, clientId }
          : { parameters, clientId, clientSecret };

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
      // A factory, not a proof: the nonce is inside the signature, so a `use_dpop_nonce` retry needs a
      // fresh one. `dpopRequest` owns reading and storing `dpop_nonce`.
      const { data } = await parService.pushedAuthorizationWithDpop(
        body,
        (nonce) => createProof(dpopPrivateKey, 'POST', PAR_ENDPOINT, undefined, nonce),
        basicAuth,
      );
      return data;
    }
    return parService.pushedAuthorization(body, basicAuth);
  };

  const handlePush = async () => {
    const { data, error: err } = await call(doParRequest);
    if (data) {
      const d = data as { request_uri?: string; expires_in?: number };
      setParResult(d);
      toast.success('PAR request completed');
    } else {
      toast.error(err);
    }
  };

  const handlePushAndRedirect = async () => {
    const { data, error: err } = await call(doParRequest);
    if (data) {
      // RFC 9126 §2.2 names this `request_uri`. The server used to hand back Authlete's camelCase
      // `requestUri` inside its envelope; T1-11 made the response the specification's body.
      const d = data as { request_uri?: string };
      if (d?.request_uri) {
        const cid = clientId || parameters.match(/client_id=([^&]+)/)?.[1] || '';
        window.location.href = `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(cid)}&request_uri=${encodeURIComponent(d.request_uri)}`;
      }
    } else {
      toast.error(err);
    }
  };

  // `authUrl` is a pure function of three values already in scope, so it is computed during render rather
  // than mirrored into state by an effect. The effect version wrote state on every change of its
  // dependencies, which renders twice for a string that was derivable the first time.
  const authUrl = useMemo(() => {
    const cid = clientId || parameters.match(/client_id=([^&]+)/)?.[1] || '';
    if (!parResult?.request_uri || !cid) return '';
    return `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(cid)}&request_uri=${encodeURIComponent(parResult.request_uri)}`;
  }, [parResult, clientId, parameters]);

  const handleRedirectToAuthorize = () => {
    if (authUrl) window.location.href = authUrl;
  };

  // `authUrl` is derived, so clearing `parResult` clears it too — there is nothing else to reset.
  const handleReset = () => {
    setParResult(null);
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
        {authMethod !== 'none' && (
          <Input label="Client Secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="your_client_secret" />
        )}

        <Select
          label="Client Auth Method"
          value={authMethod}
          onChange={(e) => setAuthMethod(e.target.value as 'post' | 'basic' | 'none')}
          options={[
            { value: 'post', label: 'client_secret_post — credentials in body' },
            { value: 'basic', label: 'client_secret_basic — Authorization header' },
            { value: 'none', label: 'none — public client (PKCE required)' },
          ]}
        />
        <p className="text-xs text-slate-400 -mt-1">
          Must match the client&apos;s registered method. Authlete checks which channel the
          credentials arrive on and returns 401 on a mismatch.
        </p>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={useDpop} onChange={(e) => setUseDpop(e.target.checked)} className="accent-blue-500 w-4 h-4" />
          Use DPoP (sender-constrained token binding)
        </label>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={handlePush} loading={loading}>
            Push Authorization Request
          </Button>
          {parResult?.request_uri && (
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

      {parResult?.request_uri && (
        <div className="mt-4 p-3 bg-slate-800 rounded-lg border border-slate-700 space-y-2">
          <p className="text-xs text-slate-300 font-mono break-all">
            <span className="text-slate-500">request_uri: </span>
            {parResult.request_uri}
          </p>
          <p className="text-xs text-slate-400">
            Expires in: {parResult.expires_in ?? '~600'}s &nbsp;|&nbsp;
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
