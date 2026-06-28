import { useState } from 'react';
import { toast } from 'sonner';
import { deviceService } from '@/services';
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

type DeviceOp = 'authorization' | 'verification' | 'complete';

const COMPLETE_RESULTS = [
  { value: 'AUTHORIZED', label: 'AUTHORIZED' },
  { value: 'ACCESS_DENIED', label: 'ACCESS_DENIED' },
  { value: 'TRANSACTION_FAILED', label: 'TRANSACTION_FAILED' },
];

const DEVICE_OPS: { value: DeviceOp; label: string }[] = [
  { value: 'authorization', label: 'Authorization' },
  { value: 'verification', label: 'Verification' },
  { value: 'complete', label: 'Complete' },
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

  const doc = activeOp ? getDoc('device', activeOp) : undefined;

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) {
      if (activeOp === 'authorization') {
        const code = (data as Record<string, unknown>).userCode as string | undefined;
        if (code) {
          setVerifyUserCode(code);
          setCompleteUserCode(code);
        }
      }
      toast.success(`${activeOp} completed`);
    } else {
      toast.error(err);
    }
  };

  return (
    <SectionPanel title="Device Flow (RFC 8628)" description="OAuth 2.0 Device Authorization Grant">
      {error && <p className="text-xs text-red-400">{error}</p>}

      <TabBar options={DEVICE_OPS} value={activeOp} onChange={setActiveOp} />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {activeOp === 'authorization' && (
        <div className="space-y-3">
          <Textarea label="Parameters (URL-encoded)" rows={4} value={parameters} onChange={(e) => setParameters(e.target.value)} placeholder="client_id=xxx&scope=openid+profile" />
          <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="your_client_id" />
          <Input label="Client Secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="your_client_secret" />
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

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { DeviceSection };
