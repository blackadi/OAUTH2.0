import { useState } from 'react';
import { apiService } from '../services/api';
import { getDoc } from '../data/operationDocs';
import HelpPopover from './HelpPopover';

type CibaOp = 'authentication' | 'issue' | 'fail' | 'complete';

const FAIL_REASONS = [
  'ACCESS_DENIED',
  'EXPIRED_LOGIN_HINT_TOKEN',
  'INVALID_BINDING_MESSAGE',
  'INVALID_TARGET',
  'INVALID_USER_CODE',
  'MISSING_USER_CODE',
  'SERVER_ERROR',
  'UNAUTHORIZED_CLIENT',
  'UNKNOWN_USER_ID',
];

const COMPLETE_RESULTS = ['AUTHORIZED', 'ACCESS_DENIED', 'TRANSACTION_FAILED'];

const CibaSection: React.FC = () => {
  const [activeOp, setActiveOp] = useState<CibaOp | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [parameters, setParameters] = useState('login_hint=admin&scope=openid');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const [issueTicket, setIssueTicket] = useState('');
  const [failTicket, setFailTicket] = useState('');
  const [failReason, setFailReason] = useState(FAIL_REASONS[0]);
  const [completeTicket, setCompleteTicket] = useState('');
  const [completeResult, setCompleteResult] = useState(COMPLETE_RESULTS[0]);
  const [completeSubject, setCompleteSubject] = useState('admin');

  const doc = activeOp ? getDoc('ciba', activeOp) : undefined;

  const call = async (fn: () => Promise<any>) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fn();
      setResult(res);
      if (activeOp === 'authentication' && res) {
        const ticket = res.ticket || '';
        if (ticket) {
          setIssueTicket(ticket);
          setFailTicket(ticket);
          setCompleteTicket(ticket);
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const active = loading ? 'Loading\u2026' : 'Run';

  const ops: { key: CibaOp; label: string }[] = [
    { key: 'authentication', label: 'Authentication' },
    { key: 'issue', label: 'Issue' },
    { key: 'fail', label: 'Fail' },
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

      {activeOp === 'authentication' && (
        <div>
          <div className="field"><label className="label">Parameters (URL-encoded)</label><textarea className="input textarea" rows={4} value={parameters} onChange={e => setParameters(e.target.value)} placeholder="login_hint=admin&scope=openid" /></div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="your_client_id" /></div>
          <div className="field"><label className="label">Client Secret</label><input className="input" type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="your_client_secret" /></div>
          <button className="button" onClick={() => call(() => apiService.cibaBackchannelAuthentication({ parameters, clientId, clientSecret }))}>{active}</button>
        </div>
      )}

      {activeOp === 'issue' && (
        <div>
          <div className="field"><label className="label">Ticket</label><input className="input" value={issueTicket} onChange={e => setIssueTicket(e.target.value)} placeholder="ticket from authentication response" /></div>
          <button className="button" onClick={() => call(() => apiService.cibaIssue(issueTicket))}>{active}</button>
        </div>
      )}

      {activeOp === 'fail' && (
        <div>
          <div className="field"><label className="label">Ticket</label><input className="input" value={failTicket} onChange={e => setFailTicket(e.target.value)} placeholder="ticket from authentication response" /></div>
          <div className="field"><label className="label">Reason</label><select className="input" value={failReason} onChange={e => setFailReason(e.target.value)}>{FAIL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
          <button className="button" onClick={() => call(() => apiService.cibaFail(failTicket, failReason))}>{active}</button>
        </div>
      )}

      {activeOp === 'complete' && (
        <div>
          <div className="field"><label className="label">Ticket</label><input className="input" value={completeTicket} onChange={e => setCompleteTicket(e.target.value)} placeholder="ticket from authentication response" /></div>
          <div className="field"><label className="label">Result</label><select className="input" value={completeResult} onChange={e => setCompleteResult(e.target.value)}>{COMPLETE_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
          <div className="field"><label className="label">Subject</label><input className="input" value={completeSubject} onChange={e => setCompleteSubject(e.target.value)} placeholder="admin" /></div>
          <button className="button" onClick={() => call(() => apiService.cibaComplete(completeTicket, completeResult, completeSubject))}>{active}</button>
        </div>
      )}

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default CibaSection;
