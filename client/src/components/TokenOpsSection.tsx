import { useState } from 'react';
import { useToken } from '../context/TokenContext';
import { apiService } from '../services/api';
import { CLIENT_ID } from '../config';
import { getDoc } from '../data/operationDocs';
import HelpPopover from './HelpPopover';

type TokenOp = 'userinfo' | 'introspect' | 'introspect-std' | 'revoke';

const OPS: { key: TokenOp; label: string }[] = [
  { key: 'userinfo', label: 'UserInfo' },
  { key: 'introspect', label: 'Introspect (Authlete)' },
  { key: 'introspect-std', label: 'Introspect (RFC 7662)' },
  { key: 'revoke', label: 'Revoke Token' },
];

const TokenOpsSection: React.FC = () => {
  const { tokenSet } = useToken();
  const at = tokenSet?.access_token;
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeOp, setActiveOp] = useState<TokenOp | null>(null);

  const [revClientId, setRevClientId] = useState(
    sessionStorage.getItem('active_client_id') || CLIENT_ID
  );
  const [revClientSecret, setRevClientSecret] = useState(
    sessionStorage.getItem('active_client_secret') || ''
  );

  const doc = activeOp ? getDoc('token-ops', activeOp) : undefined;

  const call = async (label: string, fn: () => Promise<any>) => {
    setError(null);
    setResult(null);
    setLoading(label);
    setActiveOp(label as TokenOp);
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
        {OPS.map(op => (
          <button key={op.key} className={`button ${activeOp === op.key ? 'button-active' : ''}`}
            disabled={!at || loading !== null}
            onClick={() => {
              setActiveOp(op.key);
              call(op.key, () => {
                switch (op.key) {
                  case 'userinfo': return apiService.userInfo(at!);
                  case 'introspect': return apiService.introspection(at!, at!);
                  case 'introspect-std': return apiService.introspectionStandard(at!);
                  case 'revoke': return apiService.revocation(at!, revClientId || undefined, revClientSecret || undefined, 'access_token');
                }
              });
            }}>
            {loading === op.key ? 'Loading\u2026' : op.label}
          </button>
        ))}
      </div>

      {activeOp && doc && (
        <div className="op-description">
          <span className="op-description-text">{doc.description}</span>
          <HelpPopover title={doc.title} description={doc.description} params={doc.params} returns={doc.returns} tips={doc.tips} />
        </div>
      )}

      {activeOp === 'revoke' && (
        <>
          <div className="field"><label className="label">Revocation Client ID</label><input className="input" value={revClientId} onChange={e => setRevClientId(e.target.value)} placeholder="The client the token belongs to" /></div>
          <div className="field"><label className="label">Revocation Client Secret</label><input className="input" type="password" value={revClientSecret} onChange={e => setRevClientSecret(e.target.value)} placeholder="Client secret for revocation auth" /></div>
        </>
      )}

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default TokenOpsSection;
