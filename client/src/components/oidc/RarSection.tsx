import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { rarService } from '@/services';
import { AUTHORIZATION_ENDPOINT, PAR_ENDPOINT } from '@/config';
import { createPkcePair } from '@/pkce';
import { generateKeyPair, createProof } from '@/services/dpop.service';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

const DEFAULT_RAR_JSON = JSON.stringify([
  {
    type: 'payment_initiation',
    locations: ['https://bank.example.com/payments'],
    actions: ['initiate', 'status'],
    datatypes: ['payment', 'transaction'],
    identifier: 'PMT-2026-001',
  },
], null, 2);

function RarSection() {
  const { loading, error, call } = useAsyncCall();
  const [rarJson, setRarJson] = useState(DEFAULT_RAR_JSON);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('http://localhost:3001/callback');
  const [scope, setScope] = useState('openid');
  const [usePar, setUsePar] = useState(false);
  const [useDpop, setUseDpop] = useState(false);
  const [parResult, setParResult] = useState<{ requestUri?: string; expiresIn?: number } | null>(null);
  const [pkceVerifier, setPkceVerifier] = useState(() => sessionStorage.getItem('pkce_code_verifier') || '');

  const doc = getDoc('rar', 'push');

  const handleGeneratePkce = useCallback(async () => {
    try {
      const pair = await createPkcePair();
      sessionStorage.setItem('pkce_code_verifier', pair.codeVerifier);
      setPkceVerifier(pair.codeVerifier);
      const state = crypto.randomUUID();
      sessionStorage.setItem('oauth_state', state);
      toast.success('PKCE + state generated and stored');
    } catch {
      toast.error('Failed to generate PKCE');
    }
  }, []);

  const buildParameters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('response_type', 'code');
    params.set('redirect_uri', redirectUri);
    params.set('scope', scope);

    const state = sessionStorage.getItem('oauth_state');
    if (state) params.set('state', state);

    const verifier = sessionStorage.getItem('pkce_code_verifier');
    if (verifier) {
      params.set('code_challenge_method', 'S256');
    }

    try {
      const parsed = JSON.parse(rarJson);
      params.set('authorization_details', JSON.stringify(parsed));
    } catch {
      throw new Error('Invalid authorization_details JSON');
    }

    return params.toString();
  }, [rarJson, redirectUri, scope]);

  const doPush = async () => {
    const parameters = buildParameters();
    const body = { parameters, clientId, clientSecret };

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
      const { data, dpopNonce } = await rarService.pushAuthorizationWithDpop(body, proof);
      if (dpopNonce) sessionStorage.setItem('dpop_nonce', dpopNonce);
      return data;
    }
    return rarService.pushAuthorization(body);
  };

  const handlePushAndRedirect = async () => {
    const { data, error: err } = await call(doPush);
    if (data) {
      const d = data as { requestUri?: string };
      if (d?.requestUri) {
        const cid = clientId || 'your_client_id';
        setParResult({ requestUri: d.requestUri, expiresIn: (data as { expiresIn?: number }).expiresIn });
        window.location.href = `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(cid)}&request_uri=${encodeURIComponent(d.requestUri)}`;
      }
    } else {
      toast.error(err);
    }
  };

  const handlePushOnly = async () => {
    const { data, error: err } = await call(doPush);
    if (data) {
      const d = data as { requestUri?: string; expiresIn?: number };
      setParResult(d);
      toast.success('PAR (RAR) request completed');
    } else {
      toast.error(err);
    }
  };

  const handleSendToAuthorize = async () => {
    if (usePar) {
      return handlePushAndRedirect();
    }
    try {
      const params = buildParameters();
      const cid = clientId || params.match(/client_id=([^&]+)/)?.[1] || 'your_client_id';

      const storedParams = new URLSearchParams(params);
      if (!storedParams.has('code_challenge') && pkceVerifier) {
        const pair = await createPkcePair();
        sessionStorage.setItem('pkce_code_verifier', pair.codeVerifier);
        storedParams.set('code_challenge', pair.codeChallenge);
        storedParams.set('code_challenge_method', 'S256');
      }

      storedParams.set('client_id', cid);
      const authUrl = `${AUTHORIZATION_ENDPOINT}?${storedParams.toString()}`;
      window.location.href = authUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to build authorization URL');
    }
  };

  const handleReset = () => {
    setParResult(null);
  };

  const isRarJsonValid = (() => {
    try {
      const parsed = JSON.parse(rarJson);
      if (!Array.isArray(parsed)) return false;
      return parsed.every((item: unknown) =>
        typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).type === 'string'
      );
    } catch { return false; }
  })();

  const parsedPreview = (() => {
    try { return JSON.parse(rarJson); } catch { return null; }
  })();

  return (
    <SectionPanel title="Rich Authorization Requests (RFC 9396)" description="Request granular permissions using authorization_details — structured JSON defining what the client wants to do with the user's resources">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {doc && <OperationDescription doc={doc} />}

      <div className="space-y-3">
        <Textarea label="authorization_details (JSON array)" rows={6} value={rarJson} onChange={(e) => setRarJson(e.target.value)}
          placeholder='[{ "type": "payment_initiation", "actions": ["initiate", "status"], "locations": ["https://bank.example.com/payments"] }]'
          className={!isRarJsonValid && rarJson.trim() ? 'border-red-500' : ''} />
        {!isRarJsonValid && rarJson.trim() && (
          <p className="text-xs text-red-400">Invalid JSON — must be an array of objects each with a "type" string field</p>
        )}

        <Input label="Redirect URI" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} placeholder="http://localhost:3001/callback" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="your_client_id" />
          <Input label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="openid" />
        </div>

        <Input label="Client Secret (for confidential clients)" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="your_client_secret" />

        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={handleGeneratePkce} size="sm">Generate PKCE + State</Button>
          {pkceVerifier && <span className="text-xs text-slate-400 self-center truncate max-w-[200px]" title={pkceVerifier}>verifier: {pkceVerifier.slice(0, 20)}...</span>}
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={usePar} onChange={(e) => setUsePar(e.target.checked)} className="accent-blue-500 w-4 h-4" />
          Use PAR (recommended for large authorization_details payloads)
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={useDpop} onChange={(e) => setUseDpop(e.target.checked)} className="accent-blue-500 w-4 h-4" />
          Use DPoP (sender-constrained token binding)
        </label>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleSendToAuthorize} loading={loading} disabled={!isRarJsonValid}>
            {usePar ? 'Push PAR + Authorize' : 'Authorize with RAR'}
          </Button>
          {usePar && (
            <Button variant="secondary" onClick={handlePushOnly} loading={loading} disabled={!isRarJsonValid}>
              Push PAR Only
            </Button>
          )}
          {parResult?.requestUri && (
            <Button variant="secondary" onClick={handleReset} size="sm">
              Reset
            </Button>
          )}
        </div>
      </div>

      {parResult && !usePar && <JsonBlock data={parResult} label="Response" />}
      {parResult?.requestUri && (
        <div className="mt-4 p-3 bg-slate-800 rounded-lg border border-slate-700 space-y-2">
          <p className="text-xs text-slate-300 font-mono break-all">
            <span className="text-slate-500">request_uri: </span>
            {parResult.requestUri}
          </p>
        </div>
      )}

      {parResult && <JsonBlock data={parResult} label="PAR Response" />}

      {parsedPreview && !parResult && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>RAR Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(parsedPreview as Array<Record<string, unknown>>).map((detail, i) => (
                <div key={i} className="border border-slate-700 rounded-lg overflow-hidden">
                  <div className="bg-slate-800/50 px-3 py-2 border-b border-slate-700 flex items-center gap-2">
                    <Badge>{detail.type as string}</Badge>
                  </div>
                  <div className="px-3 py-2 space-y-2 text-xs">
                    {!!detail.locations && Array.isArray(detail.locations) && (
                      <div>
                        <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Locations</span>
                        <ul className="list-disc list-inside text-slate-300 mt-1">
                          {(detail.locations as string[]).map((loc: string, j: number) => <li key={j}><code className="text-blue-400">{loc}</code></li>)}
                        </ul>
                      </div>
                    )}
                    {!!detail.actions && Array.isArray(detail.actions) && (
                      <div>
                        <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Actions</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(detail.actions as string[]).map((a: string, j: number) => <span key={j} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 rounded text-[10px]">{a}</span>)}
                        </div>
                      </div>
                    )}
                    {!!detail.datatypes && Array.isArray(detail.datatypes) && (
                      <div>
                        <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Data Types</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(detail.datatypes as string[]).map((d: string, j: number) => <span key={j} className="px-2 py-0.5 bg-blue-500/10 text-blue-300 rounded text-[10px]">{d}</span>)}
                        </div>
                      </div>
                    )}
                    {!!detail.identifier && (
                      <div>
                        <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Identifier</span>
                        <p className="text-slate-300 mt-1 font-mono">{detail.identifier as string}</p>
                      </div>
                    )}
                    {!!detail.privileges && Array.isArray(detail.privileges) && (
                      <div>
                        <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Privileges</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(detail.privileges as string[]).map((p: string, j: number) => <span key={j} className="px-2 py-0.5 bg-amber-500/10 text-amber-300 rounded text-[10px]">{p}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </SectionPanel>
  );
}

export { RarSection };
