import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { getDoc } from '../data/operationDocs';
import HelpPopover from './HelpPopover';

const HealthSection: React.FC = () => {
  const [serverStatus, setServerStatus] = useState<{ status: string; uptime: number; timestamp: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [authleteResult, setAuthleteResult] = useState<any>(null);
  const [authleteError, setAuthleteError] = useState<string | null>(null);
  const [extended, setExtended] = useState(false);
  const [loading, setLoading] = useState({ server: false, authlete: false });

  const doc = getDoc('health', 'health');
  const docAuthlete = getDoc('health', 'authlete');

  useEffect(() => {
    checkServer();
  }, []);

  const checkServer = async () => {
    setServerError(null);
    setLoading(s => ({ ...s, server: true }));
    try {
      const res = await apiService.healthCheck();
      setServerStatus(res);
    } catch (e: any) {
      setServerError(e?.message || 'Request failed');
      setServerStatus(null);
    } finally {
      setLoading(s => ({ ...s, server: false }));
    }
  };

  const checkAuthlete = async () => {
    setAuthleteError(null);
    setAuthleteResult(null);
    setLoading(s => ({ ...s, authlete: true }));
    try {
      const res = await apiService.authleteHealth(extended);
      setAuthleteResult(res);
    } catch (e: any) {
      setAuthleteError(e?.message || 'Request failed');
    } finally {
      setLoading(s => ({ ...s, authlete: false }));
    }
  };

  const fmtUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts: string[] = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  return (
    <div>
      <div className="field">
        <div className="health-server-status">
          {doc && (
            <div className="op-description">
              <span className="op-description-text">{doc.description}</span>
              <HelpPopover title={doc.title} description={doc.description} params={doc.params} returns={doc.returns} tips={doc.tips} />
            </div>
          )}
          <div className="chip-row">
            <span className={`health-dot ${serverStatus?.status === 'ok' ? 'green' : serverError ? 'red' : 'gray'}`} />
            <span className="health-label">
              {loading.server ? 'Checking...' : serverStatus?.status === 'ok' ? `Server OK — up ${fmtUptime(serverStatus.uptime)}` : serverError || 'Unknown'}
            </span>
            <button className="chip" onClick={checkServer} disabled={loading.server}>
              {loading.server ? 'Loading\u2026' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <hr className="section-divider" />

      <div className="field">
        {docAuthlete && (
          <div className="op-description">
            <span className="op-description-text">{docAuthlete.description}</span>
            <HelpPopover title={docAuthlete.title} description={docAuthlete.description} params={docAuthlete.params} returns={docAuthlete.returns} tips={docAuthlete.tips} />
          </div>
        )}
        <div className="field">
          <label className="label">
            <input type="checkbox" checked={extended} onChange={e => setExtended(e.target.checked)} />
            {' '}Extended check (test DB connectivity)
          </label>
        </div>
        <div className="chip-row">
          <button className="chip" onClick={checkAuthlete} disabled={loading.authlete}>
            {loading.authlete ? 'Loading\u2026' : 'Check Authlete Health'}
          </button>
        </div>
      </div>

      {authleteError && <div className="error">{authleteError}</div>}

      {authleteResult && (
        <div>
          <div className="chip-row">
            <span className={`health-dot ${authleteResult.healthy ? 'green' : 'red'}`} />
            <span className="health-label">
              Authlete {authleteResult.healthy ? 'healthy' : 'unhealthy'}
              {authleteResult.statusCode ? ` (HTTP ${authleteResult.statusCode})` : ''}
            </span>
          </div>
          <pre className="json-block">{JSON.stringify(authleteResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default HealthSection;
