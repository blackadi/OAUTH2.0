import { useState } from 'react';
import { useToken } from '../context/TokenContext';
import { apiService } from '../services/api';

const TokenOpsSection: React.FC = () => {
  const { tokenSet } = useToken();
  const at = tokenSet?.access_token;
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [revClientId, setRevClientId] = useState('');
  const [revClientSecret, setRevClientSecret] = useState('');

  const call = async (label: string, fn: () => Promise<any>) => {
    setError(null);
    setResult(null);
    setLoading(label);
    try {
      const res = await fn();
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <div className="ops-grid">
        <button className="button" disabled={!at || loading !== null} onClick={() => call('userinfo', () => apiService.userInfo(at!))}>
          {loading === 'userinfo' ? 'Loading…' : 'UserInfo'}
        </button>
        <button className="button" disabled={!at || loading !== null} onClick={() => call('introspect', () => apiService.introspection(at!, at!))}>
          {loading === 'introspect' ? 'Loading…' : 'Introspect (Authlete)'}
        </button>
        <button className="button" disabled={!at || loading !== null} onClick={() => call('introspect-std', () => apiService.introspectionStandard(at!))}>
          {loading === 'introspect-std' ? 'Loading…' : 'Introspect (RFC 7662)'}
        </button>
      </div>

      <div className="field"><label className="label">Revocation Client ID</label><input className="input" value={revClientId} onChange={e => setRevClientId(e.target.value)} /></div>
      <div className="field"><label className="label">Revocation Client Secret</label><input className="input" type="password" value={revClientSecret} onChange={e => setRevClientSecret(e.target.value)} /></div>
      <button className="button" disabled={!at || loading !== null} onClick={() => call('revoke', () => apiService.revocation(at!, revClientId || undefined, revClientSecret || undefined))}>
        {loading === 'revoke' ? 'Loading…' : 'Revoke Token'}
      </button>

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default TokenOpsSection;
