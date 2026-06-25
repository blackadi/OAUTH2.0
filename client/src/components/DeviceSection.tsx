import { useState } from 'react';
import { apiService } from '../services/api';
import { getDoc } from '../data/operationDocs';
import HelpPopover from './HelpPopover';

type DeviceOp = 'authorization' | 'verification' | 'complete';

const COMPLETE_RESULTS = ['AUTHORIZED', 'ACCESS_DENIED', 'TRANSACTION_FAILED'];

const DeviceSection: React.FC = () => {
  const [activeOp, setActiveOp] = useState<DeviceOp | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [parameters, setParameters] = useState('client_id=3322138582&scope=openid');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const [verifyUserCode, setVerifyUserCode] = useState('');
  const [completeUserCode, setCompleteUserCode] = useState('');
  const [completeResult, setCompleteResult] = useState(COMPLETE_RESULTS[0]);
  const [completeSubject, setCompleteSubject] = useState('admin');

  const doc = activeOp ? getDoc('device', activeOp) : undefined;

  const call = async (fn: () => Promise<any>) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fn();
      setResult(res);
      if (activeOp === 'authorization' && res) {
        const code = res.userCode || '';
        if (code) {
          setVerifyUserCode(code);
          setCompleteUserCode(code);
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const active = loading ? 'Loading\u2026' : 'Run';

  const ops: { key: DeviceOp; label: string }[] = [
    { key: 'authorization', label: 'Authorization' },
    { key: 'verification', label: 'Verification' },
    { key: 'complete', label: 'Complete' },
  ];

  return (
    <div>
      {error && <div className="error">{error}</div>}

      <div className="chip-row">
        {ops.map(op => (
          <button key={op.key} className={`chip ${activeOp === op.key ? 'chip-active' : ''}`}
            onClick={() => setActiveOp(op.key)}>
            {op.label}
          </button>
        ))}
      </div>

      {activeOp && doc && (
        <div className="op-description">
          <span className="op-description-text">{doc.description}</span>
          <HelpPopover title={doc.title} description={doc.description} params={doc.params} returns={doc.returns} tips={doc.tips} />
        </div>
      )}

      {activeOp === 'authorization' && (
        <div>
          <div className="field"><label className="label">Parameters (URL-encoded)</label><textarea className="input textarea" rows={4} value={parameters} onChange={e => setParameters(e.target.value)} placeholder="client_id=xxx&scope=openid+profile" /></div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="your_client_id" /></div>
          <div className="field"><label className="label">Client Secret</label><input className="input" type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="your_client_secret" /></div>
          <button className="button" onClick={() => call(() => apiService.deviceAuthorization({ parameters, clientId, clientSecret }))}>{active}</button>
        </div>
      )}

      {activeOp === 'verification' && (
        <div>
          <div className="field"><label className="label">User Code</label><input className="input" value={verifyUserCode} onChange={e => setVerifyUserCode(e.target.value)} placeholder="user_code from authorization response" /></div>
          <button className="button" onClick={() => call(() => apiService.deviceVerification(verifyUserCode))}>{active}</button>
        </div>
      )}

      {activeOp === 'complete' && (
        <div>
          <div className="field"><label className="label">User Code</label><input className="input" value={completeUserCode} onChange={e => setCompleteUserCode(e.target.value)} placeholder="user_code from authorization response" /></div>
          <div className="field"><label className="label">Result</label><select className="input" value={completeResult} onChange={e => setCompleteResult(e.target.value)}>{COMPLETE_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
          <div className="field"><label className="label">Subject</label><input className="input" value={completeSubject} onChange={e => setCompleteSubject(e.target.value)} placeholder="admin" /></div>
          <button className="button" onClick={() => call(() => apiService.deviceComplete(completeUserCode, completeResult, completeSubject))}>{active}</button>
        </div>
      )}

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default DeviceSection;
