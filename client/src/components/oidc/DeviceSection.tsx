import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { toast } from 'sonner';
import { deviceService } from '@/services';
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

type DeviceOp = 'authorization' | 'verification' | 'complete' | 'poll';

/** Every value `DeviceOp` can take, as a runtime list — the allowed set for the URL parameter. */
const ALL_OPS = [
  'authorization',
  'verification',
  'complete',
  'poll',
] as const satisfies readonly DeviceOp[];

const COMPLETE_RESULTS = [
  { value: 'AUTHORIZED', label: 'AUTHORIZED' },
  { value: 'ACCESS_DENIED', label: 'ACCESS_DENIED' },
  { value: 'TRANSACTION_FAILED', label: 'TRANSACTION_FAILED' },
];

const DEVICE_OPS: { value: DeviceOp; label: string }[] = [
  { value: 'authorization', label: 'Authorization' },
  { value: 'verification', label: 'Verification' },
  { value: 'complete', label: 'Complete' },
  { value: 'poll', label: 'Poll Token' },
];

const POLL_INTERVALS = [
  { value: '3', label: '3s' },
  { value: '5', label: '5s (RFC 8628 default)' },
  { value: '10', label: '10s' },
  { value: '15', label: '15s' },
];

const OP_ENDPOINT: Record<DeviceOp, string> = {
  authorization: '/api/device/authorization',
  verification: '/api/device/verification',
  complete: '/api/device/complete',
  poll: '/api/token',
};

/**
 * RFC 8628 §3.1–3.5 is a **sequence**, and the middle of it does not happen in this app.
 *
 * §3.1 asks for a device and user code, §3.3 shows them to the user, §3.4 is the user typing the code on
 * *another device*, and §3.5 is the original device polling for the token. `FlowDiagram` states that
 * order above the tabs; each tab below is rendered as the exchange it performs — what you send, what
 * comes back — the same conversion `ParSection` and `CibaSection` had, and for the same reason: a form
 * with a JSON dump underneath says nothing about why the fields on one tab feed the next.
 *
 * **Behaviour is unchanged.** Every handler, timer and session read below is the incumbent
 * implementation; only the markup changed.
 */
const DEVICE_STEPS: SequenceStepSpec[] = [
  {
    id: 'authorization',
    label: 'Device Auth',
    description: '§3.1: ask for a device code and a user code.',
    endpoint: '/api/device/authorization',
  },
  {
    id: 'verification',
    label: 'Verify Code',
    description: '§3.3: the user enters the code, on another device.',
    endpoint: '/api/device/verification',
  },
  {
    id: 'complete',
    label: 'Approve',
    description: 'The user approves or denies. Denial is still a success here.',
    endpoint: '/api/device/complete',
  },
  {
    id: 'poll',
    label: 'Poll Token',
    description: '§3.5: the device polls until it gets a token or a denial.',
    endpoint: '/api/token',
  },
];

/** Ties this section's tabs to the region they reveal — see `tabPanelProps`. */
const DEVICE_PANEL_ID = 'device-panel';

function DeviceSection() {
  /**
   * The selected operation lives in the URL, so a specific step can be shared and Back undoes it.
   *
   * Was `useState`, which made a tab invisible to the address bar: *"look at what happened on the
   * introspection step"* could not be communicated, Back left the section rather than undoing the tab,
   * and a reload lost your place mid-protocol. `useUrlState` validates the incoming value against
   * `ALL_OPS`, so a hand-edited query cannot select a tab that does not exist.
   */
  const [activeOp, setActiveOp] = useUrlState<DeviceOp>('op', ALL_OPS);
  const { loading, result, error, call } = useAsyncCall();

  const [parameters, setParameters] = useState('client_id=3322138582&scope=openid');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const [verifyUserCode, setVerifyUserCode] = useState('');
  const [completeUserCode, setCompleteUserCode] = useState('');
  const [completeResult, setCompleteResult] = useState('AUTHORIZED');
  const [completeSubject, setCompleteSubject] = useState('admin');

  const [deviceCode, setDeviceCode] = useState('');
  const [pollClientId, setPollClientId] = useState('');
  const [pollClientSecret, setPollClientSecret] = useState('');
  const [pollAuthMethod, setPollAuthMethod] = useState<'basic' | 'post'>('basic');
  const [pollInterval, setPollInterval] = useState('5');
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<unknown>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const [pollElapsed, setPollElapsed] = useState(0);

  const doc = activeOp ? getDoc('device', activeOp) : undefined;
  const traces = useTraces();
  const progress = sequenceProgress(DEVICE_STEPS, traces);
  const uid = useId();

  // Cleanup polling on unmount or tab change
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // Stop polling when tab changes away from 'poll'
  useEffect(() => {
    if (activeOp !== 'poll' && pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
      setPolling(false);
    }
  }, [activeOp]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }, []);

  const startPolling = useCallback(async () => {
    if (!deviceCode.trim()) {
      toast.error('Device code is required');
      return;
    }
    if (!pollClientId.trim()) {
      toast.error('Client ID is required');
      return;
    }

    stopPolling();
    setPollResult(null);
    setPollError(null);
    setPollAttempts(0);
    setPollElapsed(0);
    setPolling(true);
    pollStartTimeRef.current = Date.now();

    let attempts = 0;
    const intervalMs = parseInt(pollInterval, 10) * 1000;

    const doPoll = async () => {
      attempts++;
      setPollAttempts(attempts);
      setPollElapsed(Math.floor((Date.now() - pollStartTimeRef.current) / 1000));

      try {
        const res = await deviceService.pollToken(
          deviceCode.trim(),
          pollClientId.trim(),
          pollClientSecret.trim() || undefined,
          pollClientSecret.trim() ? pollAuthMethod : undefined,
        );
        setPollResult(res);
        stopPolling();
        toast.success('Token received!');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Request failed';
        setPollError(msg);

        // Auto-stop on terminal errors
        if (
          msg.includes('expired_token') ||
          msg.includes('access_denied') ||
          msg.includes('invalid_grant') ||
          msg.includes('invalid_client') ||
          msg.includes('invalid_request')
        ) {
          stopPolling();
          toast.error(`Stopped: ${msg.includes('error_description') ? msg.substring(0, 80) : msg}`);
        }
      }
    };

    // First poll immediately
    await doPoll();

    /**
     * Subsequent polls on interval.
     *
     * `void doPoll()` rather than an `async` callback: `setInterval` discards the promise, so a rejection
     * inside an async callback is unhandled — and this is the device-flow poll, which runs unattended
     * every few seconds until the user approves or the code expires. `doPoll` handles its own failures.
     */
    pollTimerRef.current = setInterval(() => void doPoll(), intervalMs);
  }, [deviceCode, pollClientId, pollClientSecret, pollAuthMethod, pollInterval, stopPolling]);

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) {
      if (activeOp === 'authorization') {
        // RFC 8628 §3.2 names these `user_code` and `device_code`. The server returned Authlete's camelCase
        // envelope until T1-11; the response is now §3.2's body, so these are the spec spellings.
        const body = data as Record<string, unknown>;
        const code = body.user_code as string | undefined;
        const dc = body.device_code as string | undefined;
        if (code) {
          setVerifyUserCode(code);
          setCompleteUserCode(code);
        }
        if (dc) {
          setDeviceCode(dc);
          setPollClientId(clientId || parameters.match(/client_id=([^&]+)/)?.[1] || '');
        }
      }
      toast.success(`${activeOp} completed`);
    } else {
      toast.error(err);
    }
  };

  const pollSettled = pollResult !== null || (pollError !== null && !polling);

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">Device Flow</h1>
        <span className="tx-ref">RFC 8628</span>
      </header>

      <p className="tx-standfirst">
        A device with no browser of its own — a TV, a CLI — shows a code, the user enters it on a
        second device, and the first one polls until that decision lands. Pick a step below to see
        what it sends and what comes back.
      </p>

      {error && <ErrorExplainer error={error} className="mb-3" />}

      <FlowDiagram
        steps={DEVICE_STEPS}
        currentStep={progress.currentStep}
        completedSteps={progress.completedSteps}
        className="mb-3"
      />

      <TabBar
        options={DEVICE_OPS}
        value={activeOp}
        onChange={setActiveOp}
        panelId={DEVICE_PANEL_ID}
      />

      <div className="tx-body" {...tabPanelProps(DEVICE_PANEL_ID, activeOp)}>
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

            {activeOp === 'authorization' && (
              <>
                <p className="tx-hint">
                  Device Flow (RFC 8628) is designed for <strong>public clients</strong> (smart TVs,
                  CLI tools, IoT) that cannot securely store a client secret. If your client is
                  public, leave Client Secret empty. Confidential clients can optionally provide it.
                </p>
                <label className="tx-field" htmlFor={`${uid}-params`}>
                  <span className="tx-label">Parameters (URL-encoded)</span>
                  <textarea
                    id={`${uid}-params`}
                    className="tx-textarea"
                    rows={4}
                    value={parameters}
                    onChange={(e) => setParameters(e.target.value)}
                    placeholder="client_id=xxx&scope=openid+profile"
                  />
                </label>
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
                  <span className="tx-label">
                    Client Secret (optional — public clients leave empty)
                  </span>
                  <input
                    id={`${uid}-secret`}
                    className="tx-input"
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="leave empty for public clients"
                  />
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() =>
                      handleCall(() =>
                        deviceService.authorization({ parameters, clientId, clientSecret }),
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

            {activeOp === 'verification' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-verify-code`}>
                  <span className="tx-label">User Code</span>
                  <input
                    id={`${uid}-verify-code`}
                    className="tx-input"
                    value={verifyUserCode}
                    onChange={(e) => setVerifyUserCode(e.target.value)}
                    placeholder="user_code from authorization response"
                  />
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() => handleCall(() => deviceService.verification(verifyUserCode))}
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
                <div className="rounded-lg border border-edge-warning bg-tint-warning p-3 text-sm text-warning-text">
                  <p className="font-medium">
                    This endpoint only answers outside your own machine.
                  </p>
                  <p className="mt-1 text-xs">
                    <code>POST /api/device/complete</code> stands in for the interactive approval a
                    real deployment would gate behind a login — RFC 8628 §3.4 assumes a human
                    decides this, not an API caller. So this server refuses it with a flat{' '}
                    <code>404</code> unless it is running with <code>NODE_ENV=development</code>. If
                    you are driving this against a hosted deployment (rather than a local{' '}
                    <code>npm run dev</code>), expect that 404 — it is the gate working as intended,
                    not a bug in this tool.
                  </p>
                </div>
                <label className="tx-field" htmlFor={`${uid}-complete-code`}>
                  <span className="tx-label">User Code</span>
                  <input
                    id={`${uid}-complete-code`}
                    className="tx-input"
                    value={completeUserCode}
                    onChange={(e) => setCompleteUserCode(e.target.value)}
                    placeholder="user_code from authorization response"
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
                        deviceService.complete(completeUserCode, completeResult, completeSubject),
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
                  Poll the token endpoint with the device_code to obtain an access token. RFC 8628
                  §3.5 says to poll no faster than the <code>interval</code> returned in Step 1
                  (default 5s per §3.2). Auto-stops on <code>expired_token</code>,{' '}
                  <code>access_denied</code>, or <code>invalid_grant</code>.
                </p>
                <label className="tx-field" htmlFor={`${uid}-devicecode`}>
                  <span className="tx-label">Device Code</span>
                  <input
                    id={`${uid}-devicecode`}
                    className="tx-input"
                    value={deviceCode}
                    onChange={(e) => setDeviceCode(e.target.value)}
                    placeholder="device_code from Step 1 (Authorization)"
                  />
                </label>
                <label className="tx-field" htmlFor={`${uid}-pollcid`}>
                  <span className="tx-label">Client ID</span>
                  <input
                    id={`${uid}-pollcid`}
                    className="tx-input"
                    value={pollClientId}
                    onChange={(e) => setPollClientId(e.target.value)}
                    placeholder="your_client_id"
                  />
                </label>
                <label className="tx-field" htmlFor={`${uid}-pollsecret`}>
                  <span className="tx-label">
                    Client Secret (optional — public clients leave empty)
                  </span>
                  <input
                    id={`${uid}-pollsecret`}
                    className="tx-input"
                    type="password"
                    value={pollClientSecret}
                    onChange={(e) => setPollClientSecret(e.target.value)}
                    placeholder="leave empty for public clients"
                  />
                </label>
                {pollClientSecret && (
                  <label className="tx-field" htmlFor={`${uid}-pollauth`}>
                    <span className="tx-label">Client Auth Method</span>
                    <select
                      id={`${uid}-pollauth`}
                      className="tx-select"
                      value={pollAuthMethod}
                      onChange={(e) => setPollAuthMethod(e.target.value as 'basic' | 'post')}
                    >
                      <option value="basic">client_secret_basic (Authorization header)</option>
                      <option value="post">client_secret_post (body parameter)</option>
                    </select>
                  </label>
                )}
                <label className="tx-field" htmlFor={`${uid}-pollinterval`}>
                  <span className="tx-label">Poll Interval</span>
                  <select
                    id={`${uid}-pollinterval`}
                    className="tx-select"
                    value={pollInterval}
                    onChange={(e) => setPollInterval(e.target.value)}
                  >
                    {POLL_INTERVALS.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="tx-actions">
                  {polling ? (
                    <button type="button" className="tx-btn" onClick={stopPolling}>
                      Stop Polling
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tx-btn tx-btn-primary"
                      onClick={() => void startPolling()}
                    >
                      {pollAttempts > 0 && polling && (
                        <span className="tx-spin" aria-hidden="true" />
                      )}
                      {pollAttempts > 0 ? 'Restart' : 'Start Polling'}
                    </button>
                  )}
                  {polling && <span className="tx-turn-note animate-pulse">Polling...</span>}
                </div>

                {(pollAttempts > 0 || pollResult || pollError) && (
                  <div className="tx-evidence" data-outcome={pollResult ? 'issued' : undefined}>
                    <span className="tx-datum">
                      <span className="tx-datum-key">Attempts</span>
                      <span className="tx-datum-value">{pollAttempts}</span>
                    </span>
                    <span className="tx-datum">
                      <span className="tx-datum-key">Elapsed</span>
                      <span className="tx-datum-value">{pollElapsed}s</span>
                    </span>
                    <span className="tx-datum">
                      <span className="tx-datum-key">Interval</span>
                      <span className="tx-datum-value">{pollInterval}s</span>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        {activeOp && (
          <div
            className="tx-turn"
            data-dir={
              activeOp === 'poll' ? (pollSettled ? 'in' : undefined) : result ? 'in' : undefined
            }
            data-state={
              activeOp === 'poll'
                ? pollSettled
                  ? 'landed'
                  : 'pending'
                : result
                  ? 'landed'
                  : 'pending'
            }
          >
            <span className="tx-marker" aria-hidden="true" />
            <div className="tx-turn-head">
              <span className="tx-turn-label">2 · Server → Client</span>
            </div>

            {activeOp === 'poll' ? (
              <>
                {pollResult ? (
                  <JsonBlock data={pollResult} label="Token Response" />
                ) : pollError && !polling ? (
                  <p className="tx-hint">{pollError}</p>
                ) : polling ? (
                  <div className="tx-waiting">
                    Polling — <code>authorization_pending</code> and <code>slow_down</code> are
                    §3.5's normal states, not errors. Waiting for the user to decide on the other
                    device.
                  </div>
                ) : (
                  <div className="tx-waiting">Nothing polled yet.</div>
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

export { DeviceSection };
