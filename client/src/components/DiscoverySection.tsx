import { useState } from 'react';
import { apiService } from '../services/api';

const DiscoverySection: React.FC = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
        <button className="button" disabled={loading !== null} onClick={() => call('discovery', () => apiService.discovery())}>
          {loading === 'discovery' ? 'Loading…' : 'Fetch OpenID Configuration'}
        </button>
        <button className="button" disabled={loading !== null} onClick={() => call('jwks', () => apiService.getJwks())}>
          {loading === 'jwks' ? 'Loading…' : 'Fetch JWKS'}
        </button>
      </div>
      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default DiscoverySection;
