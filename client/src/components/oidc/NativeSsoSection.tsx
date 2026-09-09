import { useState, useId } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { NATIVE_SSO_PROCESS_ENDPOINT, NATIVE_SSO_LOGOUT_ENDPOINT } from '@/config';
import { useToken } from '@/context/TokenContext';
import { useCredentials } from '@/context/CredentialContext';
import { nativeSsoService, type NativeSsoProcessBody } from '@/services';
import { useUrlState } from '@/hooks/useUrlState';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar, tabPanelProps } from '@/components/ui/TabBar';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';
import '@/styles/transcript.css';

/**
 * Native SSO 1.0 (draft 07) — a direct probe of this server's dedicated `/api/nativesso` pair, rendered
 * as the exchange it is, in the style `ParSection` and its siblings established.
 *
 * **This is a second surface on the same feature, not the only one.** The primary path needs no new UI
 * at all: request the `device_sso` scope in Grant Flows' authorization request, and the token response
 * that comes back already carries `device_secret` — Authlete answers `action: NATIVE_SSO` and
 * `controllers/native-sso-response.handler.ts` intercepts it inside the ordinary `/api/token` call,
 * mints the secret on first issuance, and returns it as an ordinary token-response field (now shown in
 * the Token Vault). This section instead drives Authlete's own `/nativesso` API directly — the same
 * "call the dedicated endpoint with what you already hold" shape `FederationSection`'s Registration tab
 * and `DcrSection` use — which is the surface that answers *"what does Authlete's Native SSO API do with
 * a device secret", independent of this server's `/api/token` wiring.
 *
 * **Admin-gated, not client-credentialed.** `docs/API.md` described both routes as taking a body
 * `clientId`/`clientSecret` until this session found it stale against
 * `server/src/controllers/native-sso.controller.ts`, which gates both with `requireBasicAuth`
 * (`MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`) — the same admin credential `AdminAuth` collects for DCR and
 * Federation registration.
 *
 * **The response is an unflattened vendor envelope, deliberately shown as one.** Unlike PAR, Device,
 * DCR and VCI — which forward Authlete's `responseContent` as the spec-shaped body — this controller
 * sends the whole `{resultCode, resultMessage, action, responseContent, idToken}` envelope verbatim,
 * with `responseContent` as a JSON string rather than a nested object. A debugger that quietly flattened
 * it would teach the wrong shape for *this* endpoint, so it is shown as it arrives, with the decoded
 * `responseContent` alongside it for readability.
 */

type NativeSsoOp = 'process' | 'logout';
const ALL_OPS = ['process', 'logout'] as const satisfies readonly NativeSsoOp[];
const OPS: { value: NativeSsoOp; label: string }[] = [
  { value: 'process', label: 'Process' },
  { value: 'logout', label: 'Logout' },
];

/**
 * `idTokenAudType` defaults to `"array"` on omission and this deployment's convention is `"string"`
 * (`docs/agents/quirks.md` — the same trap ID-token reissuance has to work around). Left unselected by
 * default here rather than defaulted, so leaving it alone reproduces Authlete's own default honestly.
 */
const AUD_TYPES = ['', 'string', 'array'] as const;

function decodedResponseContent(result: unknown): unknown {
  if (!result || typeof result !== 'object') return null;
  const content = (result as Record<string, unknown>).responseContent;
  if (typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Ties this section's tabs to the region they reveal — see `tabPanelProps`. */
const NATIVE_SSO_PANEL_ID = 'native-sso-panel';

function NativeSsoSection() {
  const { tokenSet } = useToken();
  const { basicAuth: auth, isComplete } = useCredentials();
  const [activeOp, setActiveOp] = useUrlState<NativeSsoOp>('op', ALL_OPS);
  const { loading, result, error, call } = useAsyncCall();
  const uid = useId();

  const accessToken = tokenSet?.access_token;
  const [deviceSecret, setDeviceSecret] = useState(tokenSet?.device_secret ?? '');
  const [refreshToken, setRefreshToken] = useState(tokenSet?.refresh_token ?? '');
  const [sub, setSub] = useState('');
  const [deviceSecretHash, setDeviceSecretHash] = useState('');
  const [idTokenAudType, setIdTokenAudType] = useState<(typeof AUD_TYPES)[number]>('');
  const [claims, setClaims] = useState('');
  const [idtHeaderParams, setIdtHeaderParams] = useState('');

  const [sessionId, setSessionId] = useState('');

  const doc = activeOp ? getDoc('native-sso', activeOp) : undefined;

  const processBody: NativeSsoProcessBody = {
    accessToken: accessToken ?? '',
    deviceSecret,
    ...(refreshToken ? { refreshToken } : {}),
    ...(sub ? { sub } : {}),
    ...(deviceSecretHash ? { deviceSecretHash } : {}),
    ...(idTokenAudType ? { idTokenAudType } : {}),
    ...(claims ? { claims } : {}),
    ...(idtHeaderParams ? { idtHeaderParams } : {}),
  };

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) toast.success(`${activeOp} completed`);
    else toast.error(err);
  };

  const decoded = decodedResponseContent(result);

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">Native SSO</h1>
        <span className="tx-ref">OpenID Native SSO 1.0 (draft 07)</span>
      </header>

      <p className="tx-standfirst">
        Lets a second native app on the same device get its own tokens — without asking the user to
        log in again — by presenting the <code>device_secret</code> a first app already obtained,
        bound to the shared authentication session rather than to either app's tokens.
      </p>

      <TabBar options={OPS} value={activeOp} onChange={setActiveOp} panelId={NATIVE_SSO_PANEL_ID} />

      <div className="tx-body" {...tabPanelProps(NATIVE_SSO_PANEL_ID, activeOp)}>
        {error && <ErrorExplainer error={error} className="mb-3" />}
        {activeOp && doc && (
          <OperationDescription
            doc={doc}
            className="tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0"
          />
        )}

        {/* ── Turn 1 ─────────────────────────────────────────────────────── */}
        {activeOp && (
          <div className="tx-turn" data-dir="out">
            <span className="tx-marker" aria-hidden="true" />
            <div className="tx-turn-head">
              <span className="tx-turn-label">1 · Client → Server</span>
              <span className="tx-turn-note">
                POST{' '}
                {activeOp === 'process' ? NATIVE_SSO_PROCESS_ENDPOINT : NATIVE_SSO_LOGOUT_ENDPOINT}
              </span>
            </div>

            <AdminAuth label="Admin" />

            {activeOp === 'process' && (
              <>
                {!accessToken && (
                  <div className="rounded-lg border border-edge-warning bg-tint-warning p-3 text-sm text-warning-text">
                    <p className="font-medium">No access token available</p>
                    <p className="mt-1 text-xs">
                      Get one from Grant Flows first — include <code>device_sso</code> in the scope
                      so the token response carries a <code>device_secret</code> alongside it.
                    </p>
                    <Link to="/auth-flows">
                      <button type="button" className="tx-btn" style={{ marginTop: '0.5rem' }}>
                        Go to Grant Flows
                      </button>
                    </Link>
                  </div>
                )}
                {accessToken && (
                  <div className="rounded-lg border border-edge-success bg-tint-success p-2 text-xs text-success-text">
                    Access token loaded from the vault:{' '}
                    <code className="font-mono">{accessToken.slice(0, 20)}...</code>
                  </div>
                )}

                <label className="tx-field" htmlFor={`${uid}-secret`}>
                  <span className="tx-label">deviceSecret (REQUIRED)</span>
                  <input
                    id={`${uid}-secret`}
                    className="tx-input"
                    value={deviceSecret}
                    onChange={(e) => setDeviceSecret(e.target.value)}
                    placeholder="Pre-filled from the vault when the last exchange carried one"
                  />
                </label>
                <p className="tx-hint">
                  Edit this to see the real failure mode: a device secret that does not match what
                  the session is bound to is refused, not silently accepted.
                </p>

                <div className="tx-row">
                  <label className="tx-field" htmlFor={`${uid}-refresh`}>
                    <span className="tx-label">refreshToken (optional)</span>
                    <input
                      id={`${uid}-refresh`}
                      className="tx-input"
                      value={refreshToken}
                      onChange={(e) => setRefreshToken(e.target.value)}
                    />
                  </label>
                  <label className="tx-field" htmlFor={`${uid}-sub`}>
                    <span className="tx-label">sub (optional)</span>
                    <input
                      id={`${uid}-sub`}
                      className="tx-input"
                      value={sub}
                      onChange={(e) => setSub(e.target.value)}
                      placeholder="Defaults to the access token's own subject"
                    />
                  </label>
                </div>
                <div className="tx-row">
                  <label className="tx-field" htmlFor={`${uid}-hash`}>
                    <span className="tx-label">deviceSecretHash (optional)</span>
                    <input
                      id={`${uid}-hash`}
                      className="tx-input"
                      value={deviceSecretHash}
                      onChange={(e) => setDeviceSecretHash(e.target.value)}
                      placeholder="Defaults to a hash of deviceSecret"
                    />
                  </label>
                  <label className="tx-field" htmlFor={`${uid}-audtype`}>
                    <span className="tx-label">idTokenAudType (optional)</span>
                    <select
                      id={`${uid}-audtype`}
                      className="tx-select"
                      value={idTokenAudType}
                      onChange={(e) =>
                        setIdTokenAudType(e.target.value as (typeof AUD_TYPES)[number])
                      }
                    >
                      {AUD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t === '' ? '(Authlete default — array)' : t}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="tx-field" htmlFor={`${uid}-claims`}>
                  <span className="tx-label">claims (optional — JSON object)</span>
                  <textarea
                    id={`${uid}-claims`}
                    className="tx-textarea"
                    rows={3}
                    value={claims}
                    onChange={(e) => setClaims(e.target.value)}
                    placeholder='{"extra_claim":"value"}'
                  />
                </label>
                <label className="tx-field" htmlFor={`${uid}-idthdr`}>
                  <span className="tx-label">idtHeaderParams (optional — JSON object)</span>
                  <textarea
                    id={`${uid}-idthdr`}
                    className="tx-textarea"
                    rows={3}
                    value={idtHeaderParams}
                    onChange={(e) => setIdtHeaderParams(e.target.value)}
                    placeholder='{"kid":"..."}'
                  />
                </label>

                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() => handleCall(() => nativeSsoService.process(processBody, auth))}
                    disabled={loading || !isComplete || !accessToken || !deviceSecret.trim()}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Process
                  </button>
                </div>
              </>
            )}

            {activeOp === 'logout' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-session`}>
                  <span className="tx-label">sessionId (REQUIRED)</span>
                  <input
                    id={`${uid}-session`}
                    className="tx-input"
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    placeholder="The sid claim of an ID token this session issued"
                  />
                </label>
                <p className="tx-hint">
                  Not held anywhere in this app — decode an ID token in the Token Vault's inspector
                  and copy its <code>sid</code> claim.
                </p>

                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() => handleCall(() => nativeSsoService.logout(sessionId, auth))}
                    disabled={loading || !isComplete || !sessionId.trim()}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        {activeOp && (
          <div
            className="tx-turn"
            data-dir={result ? 'in' : undefined}
            data-state={result ? 'landed' : 'pending'}
          >
            <span className="tx-marker" aria-hidden="true" />
            <div className="tx-turn-head">
              <span className="tx-turn-label">2 · Server → Client</span>
            </div>
            {result ? (
              <div className="space-y-3">
                <JsonBlock data={result} label="Response (vendor envelope)" />
                {decoded !== null && <JsonBlock data={decoded} label="responseContent (decoded)" />}
              </div>
            ) : (
              <div className="tx-waiting">Nothing sent yet.</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export { NativeSsoSection };
