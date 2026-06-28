import { useState } from 'react';
import { toast } from 'sonner';
import { dcrService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';

type DcrOp = 'register' | 'get' | 'update' | 'delete';

const DEFAULT_METADATA = JSON.stringify(
  {
    client_name: 'My DCR Client',
    redirect_uris: ['http://localhost:3001/callback'],
    grant_types: ['AUTHORIZATION_CODE', 'REFRESH_TOKEN'],
    token_endpoint_auth_method: 'CLIENT_SECRET_BASIC',
  },
  null,
  2,
);

const DCR_OPS: { value: DcrOp; label: string }[] = [
  { value: 'register', label: 'Register' },
  { value: 'get', label: 'Get' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
];

function DcrSection() {
  const [authId, setAuthId] = useState('');
  const [authSecret, setAuthSecret] = useState('');
  const [activeOp, setActiveOp] = useState<DcrOp | null>(null);
  const { loading, result, error, call } = useAsyncCall();

  const [regJson, setRegJson] = useState(DEFAULT_METADATA);
  const [getClientId, setGetClientId] = useState('');
  const [getToken, setGetToken] = useState('');
  const [updateClientId, setUpdateClientId] = useState('');
  const [updateToken, setUpdateToken] = useState('');
  const [updateJson, setUpdateJson] = useState('');
  const [deleteClientId, setDeleteClientId] = useState('');
  const [deleteToken, setDeleteToken] = useState('');

  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';
  const doc = activeOp ? getDoc('dcr', activeOp) : undefined;

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) {
      if (activeOp === 'register') {
        const raw = data as Record<string, unknown>;
        const parsed =
          typeof raw.responseContent === 'string'
            ? JSON.parse(raw.responseContent as string)
            : raw;
        const clientId = (parsed.client_id || parsed.clientId || '') as string;
        const regAccessToken = (
          parsed.registration_access_token || parsed.registrationAccessToken || ''
        ) as string;
        if (clientId) {
          setGetClientId(clientId);
          setUpdateClientId(clientId);
          setDeleteClientId(clientId);
        }
        if (regAccessToken) {
          setGetToken(regAccessToken);
          setUpdateToken(regAccessToken);
          setDeleteToken(regAccessToken);
        }
      }
      toast.success(`${activeOp} completed`);
    } else {
      toast.error(err);
    }
  };

  return (
    <SectionPanel title="Dynamic Client Registration (RFC 7591)" description="Register and manage clients dynamically">
      <AdminAuth clientId={authId} clientSecret={authSecret} onClientIdChange={setAuthId} onClientSecretChange={setAuthSecret} label="Admin" />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <TabBar options={DCR_OPS} value={activeOp} onChange={setActiveOp} />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {activeOp === 'register' && (
        <div className="space-y-3">
          <Textarea label="Client Metadata (JSON)" rows={10} value={regJson} onChange={(e) => setRegJson(e.target.value)} placeholder='{"client_name":"My App","redirect_uris":["http://localhost:3001/callback"],"grant_types":["AUTHORIZATION_CODE"]}' />
          <Button onClick={() => handleCall(() => dcrService.dcrRegister({ json: regJson }, auth))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'get' && (
        <div className="space-y-3">
          <Input label="Client ID" value={getClientId} onChange={(e) => setGetClientId(e.target.value)} placeholder="client_id from registration" />
          <Input label="Registration Access Token" value={getToken} onChange={(e) => setGetToken(e.target.value)} placeholder="registration_access_token from registration" />
          <Button onClick={() => handleCall(() => dcrService.dcrGet(getToken, getClientId))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'update' && (
        <div className="space-y-3">
          <Input label="Client ID" value={updateClientId} onChange={(e) => setUpdateClientId(e.target.value)} placeholder="client_id from registration" />
          <Input label="Registration Access Token" value={updateToken} onChange={(e) => setUpdateToken(e.target.value)} placeholder="registration_access_token from registration" />
          <Textarea label="Updated Client Metadata (JSON)" rows={10} value={updateJson} onChange={(e) => setUpdateJson(e.target.value)} placeholder='{"client_name":"Updated Name","redirect_uris":["http://localhost:3001/callback"]}' />
          <Button onClick={() => handleCall(() => dcrService.dcrUpdate(updateJson, updateToken, updateClientId))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'delete' && (
        <div className="space-y-3">
          <Input label="Client ID" value={deleteClientId} onChange={(e) => setDeleteClientId(e.target.value)} placeholder="client_id from registration" />
          <Input label="Registration Access Token" value={deleteToken} onChange={(e) => setDeleteToken(e.target.value)} placeholder="registration_access_token from registration" />
          <Button onClick={() => handleCall(() => dcrService.dcrDelete(deleteToken, deleteClientId))} loading={loading}>Run</Button>
        </div>
      )}

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { DcrSection };
