import { useState } from 'react';
import { apiService } from '../services/api';

const GrantManagementSection: React.FC = () => {
  const [accessToken, setAccessToken] = useState('');
  const [grantId, setGrantId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <div className="field">
        <label className="label">Access Token</label>
        <input className="input" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="Bearer token with grant_management_query or grant_management_revoke scope" />
      </div>
      <div className="field">
        <label className="label">Grant ID</label>
        <input className="input" value={grantId} onChange={e => setGrantId(e.target.value)} placeholder="The grant_id obtained from a token response" />
      </div>

      {error && <div className="error">{error}</div>}

      <div className="chip-row">
        <button className="chip" onClick={() => call(() => apiService.queryGrant(accessToken, grantId))} disabled={!accessToken || !grantId || loading}>
          {active === 'Run' ? 'Query' : active}
        </button>
        <button className="chip" onClick={() => call(() => apiService.revokeGrant(accessToken, grantId))} disabled={!accessToken || !grantId || loading}>
          {active === 'Run' ? 'Revoke' : active}
        </button>
      </div>

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default GrantManagementSection;
