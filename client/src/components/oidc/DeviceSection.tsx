import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { deviceService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

type DeviceOp = 'authorization' | 'verification' | 'complete' | 'poll';

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

function DeviceSection() {
  const [activeOp, setActiveOp] = useState<DeviceOp | null>(null);
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

    // Subsequent polls on interval
    pollTimerRef.current = setInterval(async () => {
      await doPoll();
    }, intervalMs);
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

  return (
    <SectionPanel title="Device Flow (RFC 8628)" description="OAuth 2.0 Device Authorization Grant">
      {error && <ErrorExplainer error={error} className="mb-3" />}

      <TabBar options={DEVICE_OPS} value={activeOp} onChange={setActiveOp} />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {activeOp === 'authorization' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Device Flow (RFC 8628) is designed for <strong>public clients</strong> (smart TVs, CLI tools, IoT) that cannot securely store a client secret. If your client is public, leave Client Secret empty. Confidential clients can optionally provide it.
          </p>
          <Textarea label="Parameters (URL-encoded)" rows={4} value={parameters} onChange={(e) => setParameters(e.target.value)} placeholder="client_id=xxx&scope=openid+profile" />
          <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="your_client_id" />
          <Input label="Client Secret (optional — public clients leave empty)" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="leave empty for public clients" />
          <Button onClick={() => handleCall(() => deviceService.authorization({ parameters, clientId, clientSecret }))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'verification' && (
        <div className="space-y-3">
          <Input label="User Code" value={verifyUserCode} onChange={(e) => setVerifyUserCode(e.target.value)} placeholder="user_code from authorization response" />
          <Button onClick={() => handleCall(() => deviceService.verification(verifyUserCode))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'complete' && (
        <div className="space-y-3">
          <Input label="User Code" value={completeUserCode} onChange={(e) => setCompleteUserCode(e.target.value)} placeholder="user_code from authorization response" />
          <Select label="Result" options={COMPLETE_RESULTS} value={completeResult} onChange={(e) => setCompleteResult(e.target.value)} />
          <Input label="Subject" value={completeSubject} onChange={(e) => setCompleteSubject(e.target.value)} placeholder="admin" />
          <Button onClick={() => handleCall(() => deviceService.complete(completeUserCode, completeResult, completeSubject))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'poll' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Poll the token endpoint with the device_code to obtain an access token. RFC 8628 §3.5 says to poll no faster than the <code>interval</code> returned in Step 1 (default 5s per §3.2). Auto-stops on <code>expired_token</code>, <code>access_denied</code>, or <code>invalid_grant</code>.
          </p>
          <Input label="Device Code" value={deviceCode} onChange={(e) => setDeviceCode(e.target.value)} placeholder="device_code from Step 1 (Authorization)" />
          <Input label="Client ID" value={pollClientId} onChange={(e) => setPollClientId(e.target.value)} placeholder="your_client_id" />
          <Input label="Client Secret (optional — public clients leave empty)" type="password" value={pollClientSecret} onChange={(e) => setPollClientSecret(e.target.value)} placeholder="leave empty for public clients" />
          {pollClientSecret && (
            <Select
              label="Client Auth Method"
              options={[
                { value: 'basic', label: 'client_secret_basic (Authorization header)' },
                { value: 'post', label: 'client_secret_post (body parameter)' },
              ]}
              value={pollAuthMethod}
              onChange={(e) => setPollAuthMethod(e.target.value as 'basic' | 'post')}
            />
          )}
          <Select label="Poll Interval" options={POLL_INTERVALS} value={pollInterval} onChange={(e) => setPollInterval(e.target.value)} />

          <div className="flex items-center gap-2">
            {polling ? (
              <Button onClick={stopPolling} variant="danger">Stop Polling</Button>
            ) : (
              <Button onClick={startPolling} loading={pollAttempts > 0 && polling}>
                {pollAttempts > 0 ? 'Restart' : 'Start Polling'}
              </Button>
            )}
            {polling && (
              <span className="text-xs text-muted-foreground animate-pulse">
                Polling...
              </span>
            )}
          </div>

          {(pollAttempts > 0 || pollResult || pollError) && (
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Attempts:</span>
                <span className="font-mono">{pollAttempts}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Elapsed:</span>
                <span className="font-mono">{pollElapsed}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interval:</span>
                <span className="font-mono">{pollInterval}s</span>
              </div>
            </div>
          )}
        </div>
      )}

      {activeOp === 'poll' && pollResult ? (
        <JsonBlock data={pollResult} label="Token Response" />
      ) : activeOp !== 'poll' && result ? (
        <JsonBlock data={result} label="Response" />
      ) : null}

      {activeOp === 'poll' && pollError && !polling && (
        <div className="mt-3 rounded-md bg-red-500/10 p-3 text-xs text-danger-text">
          {pollError}
        </div>
      )}
    </SectionPanel>
  );
}

export { DeviceSection };
