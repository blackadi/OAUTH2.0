import { useState, useId } from 'react';
import { toast } from 'sonner';
import { cibaService } from '@/services';
import { useUrlState } from '@/hooks/useUrlState';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar, tabPanelProps } from '@/components/ui/TabBar';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { useTraces } from '@/hooks/useTraces';
import { sequenceProgress, type SequenceStepSpec } from '@/utils/sequence-progress';
import '@/styles/transcript.css';

type CibaOp = 'authentication' | 'issue' | 'fail' | 'complete' | 'poll';

/** Every value `CibaOp` can take, as a runtime list — the allowed set for the URL parameter. */
const ALL_OPS = [
  'authentication',
  'issue',
  'fail',
  'complete',
  'poll',
] as const satisfies readonly CibaOp[];

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

const OP_ENDPOINT: Record<CibaOp, string> = {
  authentication: '/api/ciba/authentication',
  issue: '/api/ciba/issue',
  fail: '/api/ciba/fail',
  complete: '/api/ciba/complete',
  poll: '/api/token',
};

/**
 * CIBA Core is a **sequence**, not a menu.
 *
 * §7.1 pushes the backchannel authentication request, §7.3 answers with an `auth_req_id`, the client
 * then polls the token endpoint, and the OP reports the End-User's decision through `complete`. This
 * server splits §7.1/§7.3 into two calls of its own (`authentication` returns Authlete's `ticket`,
 * `issue` turns it into the `auth_req_id`), which is a departure worth *seeing* rather than being
 * surprised by — the `FlowDiagram` above the tabs states the order, and each tab below is rendered as
 * the exchange it performs: what you send, what came back.
 *
 * **Behaviour is unchanged from the tabbed-card version this replaces.** `handleCall`,
 * `handlePollToken` and every service call are the incumbent implementation; only the markup changed,
 * from "form, then a JSON dump underneath" to a two-turn transcript per operation.
 */
const CIBA_STEPS: SequenceStepSpec[] = [
  {
    id: 'authentication',
    label: 'Authenticate',
    description: 'Push the request. Returns a ticket, not yet an auth_req_id.',
    endpoint: '/api/ciba/authentication',
  },
  {
    id: 'issue',
    label: 'Issue',
    description: 'Turn the ticket into the auth_req_id the client polls with.',
    endpoint: '/api/ciba/issue',
  },
  {
    id: 'poll',
    label: 'Poll',
    description: 'Poll the token endpoint while the user decides on their device.',
    endpoint: '/api/token',
  },
  {
    id: 'complete',
    label: 'Complete',
    description: 'Report the End-User decision back to the OP.',
    endpoint: '/api/ciba/complete',
  },
];

/** Ties this section's tabs to the region they reveal — see `tabPanelProps`. */
const CIBA_PANEL_ID = 'ciba-panel';

function CibaSection() {
  /**
   * The selected operation lives in the URL, so a specific step can be shared and Back undoes it.
   *
   * Was `useState`, which made a tab invisible to the address bar: *"look at what happened on the
   * introspection step"* could not be communicated, Back left the section rather than undoing the tab,
   * and a reload lost your place mid-protocol. `useUrlState` validates the incoming value against
   * `ALL_OPS`, so a hand-edited query cannot select a tab that does not exist.
   */
  const [activeOp, setActiveOp] = useUrlState<CibaOp>('op', ALL_OPS);
  const { loading, result, error, call } = useAsyncCall();

  const [parameters, setParameters] = useState('login_hint=admin&scope=openid');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  // Authlete matches the channel against the client's registered method; see the note by the selector.
  const [authMethod, setAuthMethod] = useState<'basic' | 'post'>('basic');

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
  const traces = useTraces();
  const progress = sequenceProgress(CIBA_STEPS, traces);
  const uid = useId();

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
          setPollError((errBody.error_description as string) ?? JSON.stringify(errBody));
          toast.error(String(errBody.error ?? 'Poll failed'));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Poll request failed';
      setPollError(msg);
      toast.error(msg);
    }
  };

  const settled = activeOp === 'poll' ? pollResult !== null || pollError !== null : Boolean(result);

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">CIBA (Client-Initiated Backchannel Authentication)</h1>
        <span className="tx-ref">OpenID Connect CIBA Core 1.0</span>
      </header>

      <p className="tx-standfirst">
        The client asks the OP to authenticate a user on a device it isn&apos;t talking to right
        now, and polls for the outcome. This deployment splits §7.1/§7.3 into two calls of its own —
        pick a step below to see what it sends and what comes back.
      </p>

      {error && <ErrorExplainer error={error} className="mb-3" />}

      <FlowDiagram
        steps={CIBA_STEPS}
        currentStep={progress.currentStep}
        completedSteps={progress.completedSteps}
        className="mb-3"
      />

      <TabBar options={CIBA_OPS} value={activeOp} onChange={setActiveOp} panelId={CIBA_PANEL_ID} />

      <div className="tx-body" {...tabPanelProps(CIBA_PANEL_ID, activeOp)}>
        {activeOp && doc && (
          <OperationDescription
            doc={doc}
            className="tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0"
          />
        )}

        {/* ── Turn 1 ─────────────────────────────────────────────────────── */}
        {activeOp && (
          <div className="tx-turn" data-dir="out">
            <span className="tx-marker" aria-hidden="true" />
            <div className="tx-turn-head">
              <span className="tx-turn-label">1 · Client → Server</span>
              <span className="tx-turn-note">POST {OP_ENDPOINT[activeOp]}</span>
            </div>

            {activeOp === 'authentication' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-params`}>
                  <span className="tx-label">Parameters (URL-encoded)</span>
                  <textarea
                    id={`${uid}-params`}
                    className="tx-textarea"
                    rows={4}
                    value={parameters}
                    onChange={(e) => setParameters(e.target.value)}
                    placeholder="login_hint=admin&scope=openid"
                  />
                </label>
                <div className="tx-row">
                  <label className="tx-field" htmlFor={`${uid}-cid`}>
                    <span className="tx-label">Client ID</span>
                    <input
                      id={`${uid}-cid`}
                      className="tx-input"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="your_client_id"
                    />
                  </label>
                  <label className="tx-field" htmlFor={`${uid}-secret`}>
                    <span className="tx-label">Client Secret</span>
                    <input
                      id={`${uid}-secret`}
                      className="tx-input"
                      type="password"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="your_client_secret"
                    />
                  </label>
                </div>
                <label className="tx-field" htmlFor={`${uid}-auth`}>
                  <span className="tx-label">Client Auth Method</span>
                  <select
                    id={`${uid}-auth`}
                    className="tx-select"
                    value={authMethod}
                    onChange={(e) => setAuthMethod(e.target.value as 'basic' | 'post')}
                    aria-describedby={`${uid}-auth-hint`}
                  >
                    <option value="basic">client_secret_basic (Authorization header)</option>
                    <option value="post">client_secret_post (request body)</option>
                  </select>
                  <p className="tx-hint" id={`${uid}-auth-hint`}>
                    This must match the client&apos;s registered method. Authlete checks{' '}
                    <em>where</em> the credentials arrive, not just whether they are correct — the
                    wrong channel returns <code>401 [A157357]</code>. Authlete&apos;s CIBA guide
                    recommends <code>client_secret_basic</code>, and the backchannel and token
                    endpoints must use the same method.
                  </p>
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() =>
                      handleCall(() =>
                        cibaService.backchannelAuthentication(
                          authMethod === 'basic'
                            ? { parameters }
                            : { parameters, clientId, clientSecret },
                          authMethod === 'basic' && clientId
                            ? { clientId, clientSecret }
                            : undefined,
                        ),
                      )
                    }
                    disabled={loading}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Run
                  </button>
                </div>
              </>
            )}

            {activeOp === 'issue' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-issue-ticket`}>
                  <span className="tx-label">Ticket</span>
                  <input
                    id={`${uid}-issue-ticket`}
                    className="tx-input"
                    value={issueTicket}
                    onChange={(e) => setIssueTicket(e.target.value)}
                    placeholder="ticket from authentication response"
                  />
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() => handleCall(() => cibaService.issue(issueTicket))}
                    disabled={loading}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Run
                  </button>
                </div>
              </>
            )}

            {activeOp === 'fail' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-fail-ticket`}>
                  <span className="tx-label">Ticket</span>
                  <input
                    id={`${uid}-fail-ticket`}
                    className="tx-input"
                    value={failTicket}
                    onChange={(e) => setFailTicket(e.target.value)}
                    placeholder="ticket from authentication response"
                  />
                </label>
                <label className="tx-field" htmlFor={`${uid}-fail-reason`}>
                  <span className="tx-label">Reason</span>
                  <select
                    id={`${uid}-fail-reason`}
                    className="tx-select"
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                  >
                    {FAIL_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() => handleCall(() => cibaService.fail(failTicket, failReason))}
                    disabled={loading}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Run
                  </button>
                </div>
              </>
            )}

            {activeOp === 'complete' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-complete-ticket`}>
                  <span className="tx-label">Ticket</span>
                  <input
                    id={`${uid}-complete-ticket`}
                    className="tx-input"
                    value={completeTicket}
                    onChange={(e) => setCompleteTicket(e.target.value)}
                    placeholder="ticket from authentication response"
                  />
                </label>
                <label className="tx-field" htmlFor={`${uid}-complete-result`}>
                  <span className="tx-label">Result</span>
                  <select
                    id={`${uid}-complete-result`}
                    className="tx-select"
                    value={completeResult}
                    onChange={(e) => setCompleteResult(e.target.value)}
                  >
                    {COMPLETE_RESULTS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tx-field" htmlFor={`${uid}-complete-subject`}>
                  <span className="tx-label">Subject</span>
                  <input
                    id={`${uid}-complete-subject`}
                    className="tx-input"
                    value={completeSubject}
                    onChange={(e) => setCompleteSubject(e.target.value)}
                    placeholder="admin"
                  />
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() =>
                      handleCall(() =>
                        cibaService.complete(completeTicket, completeResult, completeSubject),
                      )
                    }
                    disabled={loading}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Run
                  </button>
                </div>
              </>
            )}

            {activeOp === 'poll' && (
              <>
                <p className="tx-hint">
                  Polls the token endpoint with the <code>auth_req_id</code> from the Issue step. In
                  a production CIBA POLL flow, the client polls at the <code>interval</code>{' '}
                  returned by the Issue endpoint.
                </p>
                <label className="tx-field" htmlFor={`${uid}-authreqid`}>
                  <span className="tx-label">auth_req_id</span>
                  <input
                    id={`${uid}-authreqid`}
                    className="tx-input"
                    value={authReqId}
                    onChange={(e) => setAuthReqId(e.target.value)}
                    placeholder="from Issue response"
                  />
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={handlePollToken}
                    disabled={loading}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Poll Token
                  </button>
                  <span className="tx-turn-note">Expected interval: {pollInterval}s</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        {activeOp && (
          <div
            className="tx-turn"
            data-dir={settled ? 'in' : undefined}
            data-state={settled ? 'landed' : 'pending'}
          >
            <span className="tx-marker" aria-hidden="true" />
            <div className="tx-turn-head">
              <span className="tx-turn-label">2 · Server → Client</span>
            </div>

            {activeOp === 'poll' ? (
              <>
                {pollResult !== null && <JsonBlock data={pollResult} label="Token Response" />}
                {pollError && <p className="tx-hint">{pollError}</p>}
                {pollResult === null && !pollError && (
                  <div className="tx-waiting">
                    Nothing polled yet. §11&apos;s normal states —{' '}
                    <code>authorization_pending</code>, <code>slow_down</code> — are not errors
                    here; they render above like any other answer.
                  </div>
                )}
              </>
            ) : result ? (
              <JsonBlock data={result} label="Response" />
            ) : (
              <div className="tx-waiting">Nothing sent yet for this step.</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export { CibaSection };
