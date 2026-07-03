import { useState } from 'react';
import { toast } from 'sonner';
import { cibaService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

type CibaOp = 'authentication' | 'issue' | 'fail' | 'complete' | 'poll';

const FAIL_REASONS = [
  { value: 'ACCESS_DENIED', label: 'ACCESS_DENIED' },
  { value: 'EXPIRED_LOGIN_HINT_TOKEN', label: 'EXPIRED_LOGIN_HINT_TOKEN' },
  { value: 'INVALID_BINDING_MESSAGE', label: 'INVALID_BINDING_MESSAGE' },
  { value: 'INVALID_TARGET', label: 'INVALID_TARGET' },
  { value: 'INVALID_USER_CODE', label: 'INVALID_USER_CODE' },
  { value: 'MISSING_USER_CODE', label: 'MISSING_USER_CODE' },
  { value: 'SERVER_ERROR', label: 'SERVER_ERROR' },
  { value: 'UNAUTHORIZED_CLIENT', label: 'UNAUTHORIZED_CLIENT' },
  { value: 'UNKNOWN_USER_ID', label: 'UNKNOWN_USER_ID' },
];

const COMPLETE_RESULTS = [
  { value: 'AUTHORIZED', label: 'AUTHORIZED' },
  { value: 'ACCESS_DENIED', label: 'ACCESS_DENIED' },
  { value: 'TRANSACTION_FAILED', label: 'TRANSACTION_FAILED' },
];

const CIBA_OPS: { value: CibaOp; label: string }[] = [
  { value: 'authentication', label: 'Authentication' },
  { value: 'issue', label: 'Issue' },
  { value: 'fail', label: 'Fail' },
  { value: 'complete', label: 'Complete' },
  { value: 'poll', label: 'Poll Token' },
];

function CibaSection() {
  const [activeOp, setActiveOp] = useState<CibaOp | null>(null);
  const { loading, result, error, call } = useAsyncCall();

  const [parameters, setParameters] = useState('login_hint=admin&scope=openid');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const [issueTicket, setIssueTicket] = useState('');
  const [failTicket, setFailTicket] = useState('');
  const [failReason, setFailReason] = useState('ACCESS_DENIED');
  const [completeTicket, setCompleteTicket] = useState('');
  const [completeResult, setCompleteResult] = useState('AUTHORIZED');
  const [completeSubject, setCompleteSubject] = useState('admin');

  const [authReqId, setAuthReqId] = useState('');
  const [pollInterval, setPollInterval] = useState(5);
  const [pollResult, setPollResult] = useState<unknown>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const doc = activeOp ? getDoc('ciba', activeOp) : undefined;

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) {
      const resp = data as Record<string, unknown>;
      if (activeOp === 'authentication') {
        const ticket = resp.ticket as string | undefined;
        if (ticket) {
          setIssueTicket(ticket);
          setFailTicket(ticket);
          setCompleteTicket(ticket);
        }
      }
      if (activeOp === 'issue') {
        const reqId = resp.authReqId as string | undefined;
        if (reqId) {
          setAuthReqId(reqId);
        }
        const interval = resp.interval as number | undefined;
        if (interval) {
          setPollInterval(interval);
        }
      }
      toast.success(`${activeOp} completed`);
    } else {
      toast.error(err);
    }
  };

  const handlePollToken = async () => {
    if (!authReqId) {
      toast.error('No auth_req_id — call Issue first');
      return;
    }
    setPollError(null);
    setPollResult(null);
    try {
      const { status, body } = await cibaService.pollToken(
        authReqId,
        clientId || undefined,
        clientSecret || undefined,
      );
      if (status === 200) {
        setPollResult(body);
        toast.success('Tokens obtained');
      } else {
        const errBody = body as Record<string, unknown>;
        if (errBody.error === 'authorization_pending') {
          setPollError(`Pending — retry in ${pollInterval}s`);
          toast.info(`Authorization pending, retry in ${pollInterval}s`);
        } else if (errBody.error === 'slow_down') {
          const newInterval = (errBody.interval as number) ?? pollInterval + 5;
          setPollInterval(newInterval);
          setPollError(`Slow down — retry in ${newInterval}s`);
          toast.info(`Slow down, retry in ${newInterval}s`);
        } else if (errBody.error === 'access_denied') {
          setPollError('Access denied by end-user');
          toast.error('Access denied');
        } else if (errBody.error === 'expired_token') {
          setPollError('auth_req_id expired — start a new flow');
          toast.error('auth_req_id expired');
        } else {
          setPollError(errBody.error_description as string ?? JSON.stringify(errBody));
          toast.error(String(errBody.error ?? 'Poll failed'));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Poll request failed';
      setPollError(msg);
      toast.error(msg);
    }
  };

  return (
    <SectionPanel title="CIBA (Client-Initiated Backchannel Authentication)" description="OpenID Connect CIBA Core 1.0">
      {error && <p className="text-xs text-red-400">{error}</p>}

      <TabBar options={CIBA_OPS} value={activeOp} onChange={setActiveOp} />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {activeOp === 'authentication' && (
        <div className="space-y-3">
          <Textarea label="Parameters (URL-encoded)" rows={4} value={parameters} onChange={(e) => setParameters(e.target.value)} placeholder="login_hint=admin&scope=openid" />
          <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="your_client_id" />
          <Input label="Client Secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="your_client_secret" />
          <Button onClick={() => handleCall(() => cibaService.backchannelAuthentication({ parameters, clientId, clientSecret }))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'issue' && (
        <div className="space-y-3">
          <Input label="Ticket" value={issueTicket} onChange={(e) => setIssueTicket(e.target.value)} placeholder="ticket from authentication response" />
          <Button onClick={() => handleCall(() => cibaService.issue(issueTicket))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'fail' && (
        <div className="space-y-3">
          <Input label="Ticket" value={failTicket} onChange={(e) => setFailTicket(e.target.value)} placeholder="ticket from authentication response" />
          <Select label="Reason" options={FAIL_REASONS} value={failReason} onChange={(e) => setFailReason(e.target.value)} />
          <Button onClick={() => handleCall(() => cibaService.fail(failTicket, failReason))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'complete' && (
        <div className="space-y-3">
          <Input label="Ticket" value={completeTicket} onChange={(e) => setCompleteTicket(e.target.value)} placeholder="ticket from authentication response" />
          <Select label="Result" options={COMPLETE_RESULTS} value={completeResult} onChange={(e) => setCompleteResult(e.target.value)} />
          <Input label="Subject" value={completeSubject} onChange={(e) => setCompleteSubject(e.target.value)} placeholder="admin" />
          <Button onClick={() => handleCall(() => cibaService.complete(completeTicket, completeResult, completeSubject))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'poll' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Polls the token endpoint with the <code className="text-slate-300">auth_req_id</code> from the Issue step.
            In a production CIBA POLL flow, the client polls at the <code className="text-slate-300">interval</code> returned by the Issue endpoint.
          </p>
          <Input label="auth_req_id" value={authReqId} onChange={(e) => setAuthReqId(e.target.value)} placeholder="from Issue response" />
          <div className="flex gap-2 items-center">
            <Button onClick={handlePollToken} loading={loading}>Poll Token</Button>
            <span className="text-xs text-slate-500">Expected interval: {pollInterval}s</span>
          </div>
          {pollResult !== null && (
            <div className="mt-2">
              <JsonBlock data={pollResult} label="Token Response" />
            </div>
          )}
          {pollError && <p className="text-xs text-amber-400">{pollError}</p>}
        </div>
      )}

      {activeOp && activeOp !== 'poll' && result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { CibaSection };
