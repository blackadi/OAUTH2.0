import { useState } from 'react';
import { apiService } from '../services/api';
import { getDoc } from '../data/operationDocs';
import HelpPopover from './HelpPopover';

type DiscOp = 'discovery' | 'jwks';

const DiscoverySection: React.FC = () => {
  const [loading, setLoading] = useState<DiscOp | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeOp, setActiveOp] = useState<DiscOp | null>(null);

  const doc = activeOp ? getDoc('discovery', activeOp) : undefined;

  const call = async (label: DiscOp, fn: () => Promise<any>) => {
    setError(null);
    setResult(null);
    setLoading(label);
    setActiveOp(label);
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
          {loading === 'discovery' ? 'Loading\u2026' : 'Fetch OpenID Configuration'}
        </button>
        <button className="button" disabled={loading !== null} onClick={() => call('jwks', () => apiService.getJwks())}>
          {loading === 'jwks' ? 'Loading\u2026' : 'Fetch JWKS'}
        </button>
      </div>

      {activeOp && doc && (
        <div className="op-description">
          <span className="op-description-text">{doc.description}</span>
          <HelpPopover title={doc.title} description={doc.description} params={doc.params} returns={doc.returns} tips={doc.tips} />
        </div>
      )}

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default DiscoverySection;
