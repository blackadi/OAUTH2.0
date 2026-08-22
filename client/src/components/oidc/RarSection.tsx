import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { rarService } from '@/services';
import type { ParSuccessResponse } from '@/services/par.service';
import { AUTHORIZATION_ENDPOINT, PAR_ENDPOINT } from '@/config';
import { createPkcePair } from '@/pkce';
import { generateKeyPair, createProof } from '@/services/dpop.service';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { SESSION_KEYS, readKey, writeKey } from '@/services/session-keys';

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
  const [parResult, setParResult] = useState<ParSuccessResponse | null>(null);
  const [pkceVerifier, setPkceVerifier] = useState(() => readKey(SESSION_KEYS.pkceVerifier) || '');

  const doc = getDoc('rar', 'push');

  const handleGeneratePkce = useCallback(async () => {
    try {
      const pair = await createPkcePair();
      writeKey(SESSION_KEYS.pkceVerifier, pair.codeVerifier);
      setPkceVerifier(pair.codeVerifier);
      const state = crypto.randomUUID();
      writeKey(SESSION_KEYS.oauthState, state);
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

    const state = readKey(SESSION_KEYS.oauthState);
    if (state) params.set('state', state);

    const verifier = readKey(SESSION_KEYS.pkceVerifier);
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
      let dpopKeyRaw = readKey(SESSION_KEYS.dpopPrivateKey);
      if (!dpopKeyRaw) {
        const pair = await generateKeyPair();
        writeKey(SESSION_KEYS.dpopPrivateKey, JSON.stringify(pair.privateKey));
        writeKey(SESSION_KEYS.dpopPublicKey, JSON.stringify(pair.publicKey));
        writeKey(SESSION_KEYS.dpopKid, pair.kid);
        dpopKeyRaw = JSON.stringify(pair.privateKey);
      }
      const dpopPrivateKey = JSON.parse(dpopKeyRaw);
      // A factory, not a proof — see the note in ParSection: a nonce retry needs a fresh signature.
      const { data } = await rarService.pushAuthorizationWithDpop(body, (nonce) =>
        createProof(dpopPrivateKey, 'POST', PAR_ENDPOINT, undefined, nonce),
      );
      return data;
    }
    return rarService.pushAuthorization(body);
  };

  const handlePushAndRedirect = async () => {
    const { data, error: err } = await call(doPush);
    if (!data) {
      toast.error(err);
      return;
    }
    // RFC 9126 §2.2 names these `request_uri` and `expires_in`. Reading Authlete's camelCase
    // `requestUri` here made this button a silent no-op: the value was `undefined`, the guard below
    // failed, and because `data` itself is truthy the error branch never ran either.
    const d = data as ParSuccessResponse;
    if (!d.request_uri) {
      // A 201 with no `request_uri` is not something to swallow — say so rather than doing nothing.
      toast.error('PAR succeeded but returned no request_uri — see the response below');
      setParResult(d);
      return;
    }
    const cid = clientId || 'your_client_id';
    setParResult(d);
    window.location.href = `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(cid)}&request_uri=${encodeURIComponent(d.request_uri)}`;
  };

  const handlePushOnly = async () => {
    const { data, error: err } = await call(doPush);
    if (data) {
      setParResult(data as ParSuccessResponse);
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
        writeKey(SESSION_KEYS.pkceVerifier, pair.codeVerifier);
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
      {error && <ErrorExplainer error={error} className="mb-3" />}

      {doc && <OperationDescription doc={doc} />}

      <div className="space-y-3">
        <Textarea label="authorization_details (JSON array)" rows={6} value={rarJson} onChange={(e) => setRarJson(e.target.value)}
          placeholder='[{ "type": "payment_initiation", "actions": ["initiate", "status"], "locations": ["https://bank.example.com/payments"] }]'
          className={!isRarJsonValid && rarJson.trim() ? 'border-red-500' : ''} />
        {!isRarJsonValid && rarJson.trim() && (
          <p className="text-xs text-danger-text">Invalid JSON — must be an array of objects each with a "type" string field</p>
        )}

        <Input label="Redirect URI" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} placeholder="http://localhost:3001/callback" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="your_client_id" />
          <Input label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="openid" />
        </div>

        <Input label="Client Secret (for confidential clients)" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="your_client_secret" />

        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={handleGeneratePkce} size="sm">Generate PKCE + State</Button>
          {pkceVerifier && <span className="text-xs text-muted-foreground self-center truncate max-w-[200px]" title={pkceVerifier}>verifier: {pkceVerifier.slice(0, 20)}...</span>}
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
          {parResult?.request_uri && (
            <Button variant="secondary" onClick={handleReset} size="sm">
              Reset
            </Button>
          )}
        </div>
      </div>

      {parResult && !usePar && <JsonBlock data={parResult} label="Response" />}
      {parResult?.request_uri && (
        <div className="mt-4 p-3 bg-surface-2 rounded-lg border border-border space-y-2">
          <p className="text-xs text-foreground-muted font-mono break-all">
            <span className="text-muted-foreground/70">request_uri: </span>
            {parResult.request_uri}
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
                <div key={i} className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-surface-2/50 px-3 py-2 border-b border-border flex items-center gap-2">
                    <Badge>{detail.type as string}</Badge>
                  </div>
                  <div className="px-3 py-2 space-y-2 text-xs">
                    {!!detail.locations && Array.isArray(detail.locations) && (
                      <div>
                        <span className="text-muted-foreground/70 font-semibold uppercase tracking-wider text-[10px]">Locations</span>
                        <ul className="list-disc list-inside text-foreground-muted mt-1">
                          {(detail.locations as string[]).map((loc: string, j: number) => <li key={j}><code className="text-info-text">{loc}</code></li>)}
                        </ul>
                      </div>
                    )}
                    {!!detail.actions && Array.isArray(detail.actions) && (
                      <div>
                        <span className="text-muted-foreground/70 font-semibold uppercase tracking-wider text-[10px]">Actions</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(detail.actions as string[]).map((a: string, j: number) => <span key={j} className="px-2 py-0.5 bg-indigo-500/10 text-accent-text rounded text-[10px]">{a}</span>)}
                        </div>
                      </div>
                    )}
                    {!!detail.datatypes && Array.isArray(detail.datatypes) && (
                      <div>
                        <span className="text-muted-foreground/70 font-semibold uppercase tracking-wider text-[10px]">Data Types</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(detail.datatypes as string[]).map((d: string, j: number) => <span key={j} className="px-2 py-0.5 bg-blue-500/10 text-info-text rounded text-[10px]">{d}</span>)}
                        </div>
                      </div>
                    )}
                    {!!detail.identifier && (
                      <div>
                        <span className="text-muted-foreground/70 font-semibold uppercase tracking-wider text-[10px]">Identifier</span>
                        <p className="text-foreground-muted mt-1 font-mono">{detail.identifier as string}</p>
                      </div>
                    )}
                    {!!detail.privileges && Array.isArray(detail.privileges) && (
                      <div>
                        <span className="text-muted-foreground/70 font-semibold uppercase tracking-wider text-[10px]">Privileges</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(detail.privileges as string[]).map((p: string, j: number) => <span key={j} className="px-2 py-0.5 bg-amber-500/10 text-warning-text rounded text-[10px]">{p}</span>)}
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
