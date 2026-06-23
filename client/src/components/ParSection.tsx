import { useState } from 'react';
import { apiService } from '../services/api';
import { getDoc } from '../data/operationDocs';
import HelpPopover from './HelpPopover';

const ParSection: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [parameters, setParameters] = useState('response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000&scope=openid&state=par_state&code_challenge_method=S256&code_challenge=');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const doc = getDoc('par', 'create');

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
      {error && <div className="error">{error}</div>}

      {doc && (
        <div className="op-description">
          <span className="op-description-text">{doc.description}</span>
          <HelpPopover title={doc.title} description={doc.description} params={doc.params} returns={doc.returns} tips={doc.tips} />
        </div>
      )}

      <div>
        <div className="field"><label className="label">Parameters (URL-encoded)</label><textarea className="input textarea" rows={4} value={parameters} onChange={e => setParameters(e.target.value)} placeholder="response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000&scope=openid&state=...&code_challenge=..." /></div>
        <div className="field"><label className="label">Client ID</label><input className="input" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="your_client_id" /></div>
        <div className="field"><label className="label">Client Secret</label><input className="input" type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="your_client_secret" /></div>
        <button className="button" onClick={() => call(() => apiService.pushedAuthorization({ parameters, clientId, clientSecret }))}>{active}</button>
      </div>

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default ParSection;
