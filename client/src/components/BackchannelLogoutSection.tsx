import { useState } from 'react';
import { apiService } from '../services/api';

function decodeJwtPayload(token: string): Record<string, unknown> | string {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return 'Invalid JWT: expected 3 parts';
    const payload = parts[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json;
  } catch (e) {
    return `Failed to decode: ${e instanceof Error ? e.message : String(e)}`;
  }
}

const BackchannelLogoutSection: React.FC = () => {
  const [clientIdentifier, setClientIdentifier] = useState('');
  const [subject, setSubject] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [mgmtClientId, setMgmtClientId] = useState('');
  const [mgmtClientSecret, setMgmtClientSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const auth = btoa(`${mgmtClientId}:${mgmtClientSecret}`);

  const call = async (fn: () => Promise<any>) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fn();
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const active = loading ? 'Loading\u2026' : 'Run';

  const handleIssue = () =>
    call(() => apiService.backchannelLogoutIssue({ clientIdentifier, subject, sessionId }, auth));

  const handleDeliver = () =>
    call(() => apiService.backchannelLogoutDeliver({ clientIdentifier, subject, sessionId }, auth));

  const handleDeliverAll = () =>
    call(() => apiService.backchannelLogoutDeliverAll({ subject, sessionId }, auth));

  const decodedLogoutToken = result?.logoutToken ? decodeJwtPayload(result.logoutToken) : null;
  const hasTokenResult = !!(result?.logoutToken);

  return (
    <div>
      <div className="field">
        <label className="label">MGMT Client ID</label>
        <input className="input" value={mgmtClientId} onChange={e => setMgmtClientId(e.target.value)} placeholder="Admin Basic auth username" type="password" />
      </div>
      <div className="field">
        <label className="label">MGMT Client Secret</label>
        <input className="input" value={mgmtClientSecret} onChange={e => setMgmtClientSecret(e.target.value)} placeholder="Admin Basic auth password" type="password" />
      </div>
      <div className="field">
        <label className="label">Client Identifier</label>
        <input className="input" value={clientIdentifier} onChange={e => setClientIdentifier(e.target.value)} placeholder="client_id or client_id_alias (required for issue/deliver)" />
      </div>
      <div className="field">
        <label className="label">Subject</label>
        <input className="input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="End-user subject (required for deliver-all)" />
      </div>
      <div className="field">
        <label className="label">Session ID</label>
        <input className="input" value={sessionId} onChange={e => setSessionId(e.target.value)} placeholder="Optional session identifier (alternative to subject)" />
      </div>

      {error && <div className="error">{error}</div>}

      <div className="chip-row">
        <button className="chip" onClick={handleIssue} disabled={!auth || !clientIdentifier || loading}>
          {active === 'Run' ? 'Issue Token' : active}
        </button>
        <button className="chip" onClick={handleDeliver} disabled={!auth || !clientIdentifier || loading}>
          {active === 'Run' ? 'Issue & Deliver' : active}
        </button>
        <button className="chip" onClick={handleDeliverAll} disabled={!auth || (!subject && !sessionId) || loading}>
          {active === 'Run' ? 'Issue & Deliver All' : active}
        </button>
      </div>

      {result && !hasTokenResult && (
        <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>
      )}

      {hasTokenResult && (
        <div>
          <details className="section" open>
            <summary className="section-summary">Raw Response</summary>
            <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>
          </details>
          <details className="section" open>
            <summary className="section-summary">Decoded Logout Token (JWT Payload)</summary>
            {typeof decodedLogoutToken === 'string' ? (
              <div className="error">{decodedLogoutToken}</div>
            ) : (
              <pre className="json-block">{JSON.stringify(decodedLogoutToken, null, 2)}</pre>
            )}
            <p className="small">
              The logout token is a JWT with <code>typ: "logout+jwt"</code> and an <code>events</code> claim containing
              {' '}<code>http://schemas.openid.net/event/backchannel-logout</code>. The <code>sid</code> claim identifies
              the session being terminated. Per spec, only <code>sub</code> or <code>sid</code> is present (not both).
            </p>
          </details>
        </div>
      )}

      {result && Array.isArray(result) && (
        <div>
          <details className="section" open>
            <summary className="section-summary">Deliver-All Results ({result.length} clients processed)</summary>
            <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
};

export default BackchannelLogoutSection;
