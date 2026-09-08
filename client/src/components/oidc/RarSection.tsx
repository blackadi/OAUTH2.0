import { useState, useCallback, useId } from 'react';
import { toast } from 'sonner';
import { rarService } from '@/services';
import { navigateTo } from '@/services/trace-store';
import type { ParSuccessResponse } from '@/services/par.service';
import { AUTHORIZATION_ENDPOINT, PAR_ENDPOINT } from '@/config';
import { createPkcePair } from '@/pkce';
import { generateKeyPair, createProof } from '@/services/dpop.service';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { SESSION_KEYS, readKey, readJsonKey, writeKey } from '@/services/session-keys';
import type { JWK } from '@/services/crypto-utils';
import '@/styles/transcript.css';

const DEFAULT_RAR_JSON = JSON.stringify(
  [
    {
      type: 'payment_initiation',
      locations: ['https://bank.example.com/payments'],
      actions: ['initiate', 'status'],
      datatypes: ['payment', 'transaction'],
      identifier: 'PMT-2026-001',
    },
  ],
  null,
  2,
);

/**
 * RFC 9396 (RAR), rendered as the exchange it is — the same conversion `ParSection` and its siblings
 * had. Two distinct routes share the same composed request: direct to the authorization endpoint, or
 * pushed through PAR first — so the front channel (turn 3) is reached either straight from turn 1 or by
 * way of turn 2, and both are shown with a state that reflects which happened.
 *
 * **Behaviour is unchanged.** Every handler below is the incumbent implementation; only the markup
 * around them changed.
 */
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
  const uid = useId();

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
      // Mint a key if this session has none. The value is read back below rather than threaded through
      // a local, so there is one read path whether the key was just generated or already stored.
      if (!readKey(SESSION_KEYS.dpopPrivateKey)) {
        const pair = await generateKeyPair();
        writeKey(SESSION_KEYS.dpopPrivateKey, JSON.stringify(pair.privateKey));
        writeKey(SESSION_KEYS.dpopPublicKey, JSON.stringify(pair.publicKey));
        writeKey(SESSION_KEYS.dpopKid, pair.kid);
      }
      /**
       * Read as a typed JWK. This was `JSON.parse(dpopKeyRaw)` — `any` — flowing straight into
       * `crypto.subtle.importKey` as a **signing key**, so the compiler checked nothing about the most
       * sensitive argument in the call. `readJsonKey` also returns `null` on a corrupted entry rather
       * than throwing, which is the difference between "no key" and an unexplained failure.
       */
      const dpopPrivateKey = readJsonKey<JWK>(SESSION_KEYS.dpopPrivateKey);
      if (!dpopPrivateKey) {
        toast.error('The stored DPoP key is unreadable. Generate a new one in Grant Flows.');
        return null;
      }
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
    navigateTo(
      `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(cid)}&request_uri=${encodeURIComponent(d.request_uri)}`,
      'authorize (RAR via PAR) — front channel, browser leaves with the request_uri',
    );
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
      navigateTo(
        authUrl,
        'authorize (RAR) — front channel, browser leaves for the authorization endpoint',
      );
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
      return parsed.every(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).type === 'string',
      );
    } catch {
      return false;
    }
  })();

  const parsedPreview = (() => {
    try {
      return JSON.parse(rarJson);
    } catch {
      return null;
    }
  })();

  const pushed = usePar && Boolean(parResult);

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">Rich Authorization Requests</h1>
        <span className="tx-ref">RFC 9396</span>
      </header>

      <p className="tx-standfirst">
        <code>authorization_details</code> replaces a scope string with structured JSON describing
        exactly what the client wants to do — the type of access, which resource, which actions.
        Compose it, then send it either straight to the authorization endpoint or pushed through PAR
        first.
      </p>

      <div className="tx-body">
        {error && <ErrorExplainer error={error} className="mb-3" />}
        {doc && (
          <OperationDescription
            doc={doc}
            className="tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0"
          />
        )}

        {/* ── Turn 1 ─────────────────────────────────────────────────────── */}
        <div className="tx-turn" data-dir="out">
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">1 · Client → Server</span>
            <span className="tx-turn-note">
              {usePar ? `POST ${PAR_ENDPOINT}` : 'built locally, sent via the front channel'}
            </span>
          </div>

          <label className="tx-field" htmlFor={`${uid}-rar`}>
            <span className="tx-label">authorization_details (JSON array)</span>
            <textarea
              id={`${uid}-rar`}
              className="tx-textarea"
              rows={6}
              value={rarJson}
              onChange={(e) => setRarJson(e.target.value)}
              placeholder='[{ "type": "payment_initiation", "actions": ["initiate", "status"], "locations": ["https://bank.example.com/payments"] }]'
            />
            {!isRarJsonValid && rarJson.trim() && (
              <p className="tx-hint" style={{ color: 'var(--t-refused, inherit)' }}>
                Invalid JSON — must be an array of objects each with a &quot;type&quot; string field
              </p>
            )}
          </label>

          <label className="tx-field" htmlFor={`${uid}-redirect`}>
            <span className="tx-label">Redirect URI</span>
            <input
              id={`${uid}-redirect`}
              className="tx-input"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="http://localhost:3001/callback"
            />
          </label>

          <div className="tx-row">
            <label className="tx-field" htmlFor={`${uid}-cid`}>
              <span className="tx-label">Client ID</span>
              <input
                id={`${uid}-cid`}
                className="tx-input"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="your_client_id"
              />
            </label>
            <label className="tx-field" htmlFor={`${uid}-scope`}>
              <span className="tx-label">Scope</span>
              <input
                id={`${uid}-scope`}
                className="tx-input"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="openid"
              />
            </label>
          </div>

          <label className="tx-field" htmlFor={`${uid}-secret`}>
            <span className="tx-label">Client Secret (for confidential clients)</span>
            <input
              id={`${uid}-secret`}
              className="tx-input"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="your_client_secret"
            />
          </label>

          <div className="tx-actions" style={{ marginBottom: '1rem' }}>
            <button type="button" className="tx-btn" onClick={() => void handleGeneratePkce()}>
              Generate PKCE + State
            </button>
            {pkceVerifier && (
              <span className="tx-turn-note" title={pkceVerifier}>
                verifier {pkceVerifier.slice(0, 12)}…
              </span>
            )}
          </div>

          <label className="tx-check">
            <input type="checkbox" checked={usePar} onChange={(e) => setUsePar(e.target.checked)} />
            Use PAR (recommended for large authorization_details payloads)
          </label>
          <label className="tx-check">
            <input
              type="checkbox"
              checked={useDpop}
              onChange={(e) => setUseDpop(e.target.checked)}
            />
            Use DPoP (sender-constrained token binding)
          </label>

          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={() => void handleSendToAuthorize()}
              disabled={!isRarJsonValid || loading}
            >
              {loading && <span className="tx-spin" aria-hidden="true" />}
              {usePar ? 'Push PAR + Authorize' : 'Authorize with RAR'}
            </button>
            {usePar && (
              <button
                type="button"
                className="tx-btn"
                onClick={() => void handlePushOnly()}
                disabled={!isRarJsonValid || loading}
              >
                Push PAR Only
              </button>
            )}
            {parResult?.request_uri && (
              <button type="button" className="tx-btn" onClick={handleReset}>
                Reset
              </button>
            )}
          </div>

          {parsedPreview && (
            <div className="tx-evidence" data-outcome="issued" style={{ marginTop: '1rem' }}>
              <div className="tx-evidence-head">
                <span className="tx-evidence-verdict">Preview</span>
              </div>
              {(parsedPreview as Array<Record<string, unknown>>).map((detail, i) => (
                <div key={i} style={{ marginBottom: '0.75rem' }}>
                  <span className="tx-datum-key">{detail.type as string}</span>
                  {!!detail.locations && Array.isArray(detail.locations) && (
                    <span className="tx-datum">
                      <span className="tx-datum-key">Locations</span>
                      <span className="tx-datum-value">
                        {(detail.locations as string[]).join(', ')}
                      </span>
                    </span>
                  )}
                  {!!detail.actions && Array.isArray(detail.actions) && (
                    <span className="tx-datum">
                      <span className="tx-datum-key">Actions</span>
                      <span className="tx-datum-value">
                        {(detail.actions as string[]).join(', ')}
                      </span>
                    </span>
                  )}
                  {!!detail.datatypes && Array.isArray(detail.datatypes) && (
                    <span className="tx-datum">
                      <span className="tx-datum-key">Data Types</span>
                      <span className="tx-datum-value">
                        {(detail.datatypes as string[]).join(', ')}
                      </span>
                    </span>
                  )}
                  {!!detail.identifier && (
                    <span className="tx-datum">
                      <span className="tx-datum-key">Identifier</span>
                      <span className="tx-datum-value">{detail.identifier as string}</span>
                    </span>
                  )}
                  {!!detail.privileges && Array.isArray(detail.privileges) && (
                    <span className="tx-datum">
                      <span className="tx-datum-key">Privileges</span>
                      <span className="tx-datum-value">
                        {(detail.privileges as string[]).join(', ')}
                      </span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        <div
          className="tx-turn"
          data-dir={pushed ? 'in' : undefined}
          data-state={pushed ? 'landed' : 'pending'}
        >
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">2 · Server → Client</span>
            {pushed && <span className="tx-turn-note">201 Created</span>}
          </div>

          {usePar ? (
            parResult ? (
              <JsonBlock data={parResult} label="PAR Response" />
            ) : (
              <div className="tx-waiting">
                The server will answer with a <code>request_uri</code> and the seconds it stays
                valid.
              </div>
            )
          ) : (
            <div className="tx-waiting">
              Not used in this mode — the request goes straight to the authorization endpoint in
              turn 3, with no back-channel push first.
            </div>
          )}
        </div>

        {/* ── Turn 3 ─────────────────────────────────────────────────────── */}
        <div className="tx-turn">
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">3 · Browser → Server</span>
            <span className="tx-turn-note">front channel</span>
          </div>
          <div className="tx-waiting">
            {usePar
              ? 'Pushing succeeds and carries a request_uri, and this happens automatically.'
              : 'Pressing Authorize with RAR leaves the application here, carrying the authorization_details in the query string.'}
          </div>
        </div>
      </div>
    </section>
  );
}

export { RarSection };
