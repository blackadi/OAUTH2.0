import { useState } from 'react';
import { toast } from 'sonner';
import { clientService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';

type ClientOp =
  | 'list' | 'get' | 'create' | 'update' | 'delete'
  | 'lock' | 'unlock' | 'refresh-secret' | 'update-secret'
  | 'list-auth' | 'update-auth' | 'delete-auth'
  | 'get-granted-scopes' | 'delete-granted-scopes'
  | 'get-requestable-scopes' | 'update-requestable-scopes'
  | 'delete-requestable-scopes';

const CLIENT_TYPE_OPTIONS = [
  { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL' },
  { value: 'PUBLIC', label: 'PUBLIC' },
];

const APP_TYPE_OPTIONS = [
  { value: 'web', label: 'web' },
  { value: 'native', label: 'native' },
];

const AUTH_METHOD_OPTIONS = [
  { value: 'NONE', label: 'NONE' },
  { value: 'CLIENT_SECRET_BASIC', label: 'CLIENT_SECRET_BASIC' },
  { value: 'CLIENT_SECRET_POST', label: 'CLIENT_SECRET_POST' },
  { value: 'CLIENT_SECRET_JWT', label: 'CLIENT_SECRET_JWT' },
  { value: 'PRIVATE_KEY_JWT', label: 'PRIVATE_KEY_JWT' },
  { value: 'SELF_SIGNED_TLS_CLIENT_AUTH', label: 'SELF_SIGNED_TLS_CLIENT_AUTH' },
];

const BASIC_OPS: { value: ClientOp; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'get', label: 'Get' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'lock', label: 'Lock' },
  { value: 'unlock', label: 'Unlock' },
  { value: 'refresh-secret', label: 'Refresh Secret' },
  { value: 'update-secret', label: 'Update Secret' },
];

const ADVANCED_OPS: { value: ClientOp; label: string }[] = [
  { value: 'list-auth', label: 'List Auth' },
  { value: 'update-auth', label: 'Update Auth' },
  { value: 'delete-auth', label: 'Delete Auth' },
  { value: 'get-granted-scopes', label: 'Get Granted Scopes' },
  { value: 'delete-granted-scopes', label: 'Delete Granted Scopes' },
  { value: 'get-requestable-scopes', label: 'Get Requestable Scopes' },
  { value: 'update-requestable-scopes', label: 'Update Requestable Scopes' },
  { value: 'delete-requestable-scopes', label: 'Delete Requestable Scopes' },
];

function ClientManagementSection() {
  const [authId, setAuthId] = useState('');
  const [authSecret, setAuthSecret] = useState('');
  const [activeOp, setActiveOp] = useState<ClientOp | null>(null);
  const { loading, result, error, call } = useAsyncCall();

  const [listStart, setListStart] = useState('0');
  const [listEnd, setListEnd] = useState('20');
  const [getClientId, setGetClientId] = useState('');
  const [deleteClientId, setDeleteClientId] = useState('');
  const [flagClientId, setFlagClientId] = useState('');
  const [refreshClientId, setRefreshClientId] = useState('');
  const [secretClientId, setSecretClientId] = useState('');
  const [newSecret, setNewSecret] = useState('');

  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState('CONFIDENTIAL');
  const [createAppType, setCreateAppType] = useState('web');
  const [createGrantTypes, setCreateGrantTypes] = useState('AUTHORIZATION_CODE');
  const [createResponseTypes, setCreateResponseTypes] = useState('code');
  const [createRedirectUris, setCreateRedirectUris] = useState('');
  const [createAuthMethod, setCreateAuthMethod] = useState('CLIENT_SECRET_BASIC');
  const [createDescription, setCreateDescription] = useState('');
  const [createDeveloper, setCreateDeveloper] = useState('');

  const [updateClientId, setUpdateClientId] = useState('');
  const [updateName, setUpdateName] = useState('');
  const [updateDesc, setUpdateDesc] = useState('');
  const [updateUris, setUpdateUris] = useState('');

  const [authSubject, setAuthSubject] = useState('');
  const [authUpdateClientId, setAuthUpdateClientId] = useState('');
  const [authUpdateSubject, setAuthUpdateSubject] = useState('');
  const [authUpdateScopes, setAuthUpdateScopes] = useState('');
  const [authDeleteClientId, setAuthDeleteClientId] = useState('');
  const [authDeleteSubject, setAuthDeleteSubject] = useState('');

  const [gsClientId, setGsClientId] = useState('');
  const [gsSubject, setGsSubject] = useState('');

  const [rsClientId, setRsClientId] = useState('');
  const [rsScopes, setRsScopes] = useState('');

  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';
  const doc = activeOp ? getDoc('client', activeOp) : undefined;

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) {
      toast.success(`${activeOp} completed`);
    } else {
      toast.error(err);
    }
  };

  return (
    <SectionPanel title="Client Management" description="Register and manage OAuth clients">
      <AdminAuth clientId={authId} clientSecret={authSecret} onClientIdChange={setAuthId} onClientSecretChange={setAuthSecret} />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <TabBar options={BASIC_OPS} value={activeOp} onChange={setActiveOp} disabled={!auth} />

      <span className="text-xs text-muted-foreground">Advanced:</span>
      <TabBar options={ADVANCED_OPS} value={activeOp} onChange={setActiveOp} disabled={!auth} />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {activeOp === 'list' && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <Input label="Start (inclusive)" value={listStart} onChange={(e) => setListStart(e.target.value)} placeholder="0" />
            <Input label="End (exclusive)" value={listEnd} onChange={(e) => setListEnd(e.target.value)} placeholder="20" />
          </div>
          <Button onClick={() => handleCall(() => clientService.listClients(auth, Number(listStart), Number(listEnd)))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'get' && (
        <div className="space-y-3">
          <Input label="Client ID" value={getClientId} onChange={(e) => setGetClientId(e.target.value)} placeholder="Numeric client ID from Authlete" />
          <Button onClick={() => handleCall(() => clientService.getClient(getClientId, auth))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'create' && (
        <div className="space-y-3">
          <Input label="Client Name" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. My App" />
          <Select label="Client Type" options={CLIENT_TYPE_OPTIONS} value={createType} onChange={(e) => setCreateType(e.target.value)} />
          <Select label="Application Type" options={APP_TYPE_OPTIONS} value={createAppType} onChange={(e) => setCreateAppType(e.target.value)} />
          <Input label="Grant Types (comma-separated)" value={createGrantTypes} onChange={(e) => setCreateGrantTypes(e.target.value)} placeholder="e.g. AUTHORIZATION_CODE,REFRESH_TOKEN" />
          <Input label="Response Types (space-separated)" value={createResponseTypes} onChange={(e) => setCreateResponseTypes(e.target.value)} placeholder="e.g. code" />
          <Input label="Redirect URIs (space-separated)" value={createRedirectUris} onChange={(e) => setCreateRedirectUris(e.target.value)} placeholder="https://your-app.com/callback" />
          <Select label="Token Auth Method" options={AUTH_METHOD_OPTIONS} value={createAuthMethod} onChange={(e) => setCreateAuthMethod(e.target.value)} />
          <Input label="Description" value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} placeholder="Optional description" />
          <Input label="Developer" value={createDeveloper} onChange={(e) => setCreateDeveloper(e.target.value)} placeholder="Optional developer identifier" />
          <Button onClick={() => handleCall(() => clientService.createClient({ client: { clientName: createName, clientType: createType, applicationType: createAppType, grantTypes: createGrantTypes.split(/[\s,]+/).filter(Boolean), responseTypes: createResponseTypes.split(/[\s,]+/).filter(Boolean), redirectUris: createRedirectUris.split(/[\s,]+/).filter(Boolean), tokenAuthMethod: createAuthMethod, description: createDescription, developer: createDeveloper } }, auth))} loading={loading}>
            Run
          </Button>
        </div>
      )}

      {activeOp === 'update' && (
        <div className="space-y-3">
          <Input label="Client ID" value={updateClientId} onChange={(e) => setUpdateClientId(e.target.value)} placeholder="Numeric client ID to update" />
          <Input label="Client Name" value={updateName} onChange={(e) => setUpdateName(e.target.value)} placeholder="New name (leave empty to keep)" />
          <Input label="Description" value={updateDesc} onChange={(e) => setUpdateDesc(e.target.value)} placeholder="New description (leave empty to keep)" />
          <Input label="Redirect URIs (space-separated)" value={updateUris} onChange={(e) => setUpdateUris(e.target.value)} placeholder="https://your-app.com/callback" />
          <Button onClick={() => handleCall(() => clientService.updateClient(updateClientId, { client: { clientName: updateName || undefined, description: updateDesc || undefined, redirectUris: updateUris ? updateUris.split(/[\s,]+/).filter(Boolean) : undefined } }, auth))} loading={loading}>
            Run
          </Button>
        </div>
      )}

      {activeOp === 'delete' && (
        <div className="space-y-3">
          <Input label="Client ID" value={deleteClientId} onChange={(e) => setDeleteClientId(e.target.value)} placeholder="Numeric client ID to permanently delete" />
          <Button onClick={() => handleCall(() => clientService.deleteClient(deleteClientId, auth))} loading={loading}>Run</Button>
        </div>
      )}

      {(activeOp === 'lock' || activeOp === 'unlock') && (
        <div className="space-y-3">
          <Input label="Client ID / Alias" value={flagClientId} onChange={(e) => setFlagClientId(e.target.value)} placeholder="Client ID to suspend/restore" />
          <Button onClick={() => handleCall(() => clientService.lockFlag(flagClientId, activeOp === 'lock', auth))} loading={loading}>
            {activeOp === 'lock' ? 'Lock' : 'Unlock'}
          </Button>
        </div>
      )}

      {activeOp === 'refresh-secret' && (
        <div className="space-y-3">
          <Input label="Client ID / Alias" value={refreshClientId} onChange={(e) => setRefreshClientId(e.target.value)} placeholder="Client ID to rotate secret for" />
          <Button onClick={() => handleCall(() => clientService.refreshSecret(refreshClientId, auth))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'update-secret' && (
        <div className="space-y-3">
          <Input label="Client ID / Alias" value={secretClientId} onChange={(e) => setSecretClientId(e.target.value)} placeholder="Client ID to set secret for" />
          <Input label="New Client Secret" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} placeholder="A-Z, a-z, 0-9, -, _ (max 86 chars)" />
          <Button onClick={() => handleCall(() => clientService.updateSecret(secretClientId, newSecret, auth))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'list-auth' && (
        <div className="space-y-3">
          <Input label="Subject (user ID)" value={authSubject} onChange={(e) => setAuthSubject(e.target.value)} placeholder="End-user identifier" />
          <Button onClick={() => handleCall(() => clientService.listAuth(authSubject, auth))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'update-auth' && (
        <div className="space-y-3">
          <Input label="Client ID" value={authUpdateClientId} onChange={(e) => setAuthUpdateClientId(e.target.value)} placeholder="Client to update authorizations for" />
          <Input label="Subject (user ID)" value={authUpdateSubject} onChange={(e) => setAuthUpdateSubject(e.target.value)} placeholder="End-user identifier" />
          <Input label="Scopes (space-separated)" value={authUpdateScopes} onChange={(e) => setAuthUpdateScopes(e.target.value)} placeholder="New scopes for existing tokens" />
          <Button onClick={() => handleCall(() => clientService.updateAuth(authUpdateClientId, { subject: authUpdateSubject, scopes: authUpdateScopes }, auth))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'delete-auth' && (
        <div className="space-y-3">
          <Input label="Client ID" value={authDeleteClientId} onChange={(e) => setAuthDeleteClientId(e.target.value)} placeholder="Client to revoke authorizations for" />
          <Input label="Subject (user ID)" value={authDeleteSubject} onChange={(e) => setAuthDeleteSubject(e.target.value)} placeholder="End-user identifier" />
          <Button onClick={() => handleCall(() => clientService.deleteAuth(authDeleteClientId, authDeleteSubject, auth))} loading={loading}>Run</Button>
        </div>
      )}

      {(activeOp === 'get-granted-scopes' || activeOp === 'delete-granted-scopes') && (
        <div className="space-y-3">
          <Input label="Client ID" value={gsClientId} onChange={(e) => setGsClientId(e.target.value)} placeholder="Client to inspect/clear scopes for" />
          <Input label="Subject (user ID)" value={gsSubject} onChange={(e) => setGsSubject(e.target.value)} placeholder="End-user identifier" />
          <Button onClick={() => handleCall(() => activeOp === 'get-granted-scopes' ? clientService.getGrantedScopes(gsClientId, gsSubject, auth) : clientService.deleteGrantedScopes(gsClientId, gsSubject, auth))} loading={loading}>
            Run
          </Button>
        </div>
      )}

      {activeOp === 'get-requestable-scopes' && (
        <div className="space-y-3">
          <Input label="Client ID" value={rsClientId} onChange={(e) => setRsClientId(e.target.value)} placeholder="Client to check scope restrictions for" />
          <Button onClick={() => handleCall(() => clientService.getRequestableScopes(rsClientId, auth))} loading={loading}>Run</Button>
        </div>
      )}

      {activeOp === 'update-requestable-scopes' && (
        <div className="space-y-3">
          <Input label="Client ID" value={rsClientId} onChange={(e) => setRsClientId(e.target.value)} placeholder="Client to restrict scopes for" />
          <Input label="Scopes (space-separated)" value={rsScopes} onChange={(e) => setRsScopes(e.target.value)} placeholder="Allowed scopes (empty = unrestricted)" />
          <Button onClick={() => handleCall(() => clientService.updateRequestableScopes(rsClientId, { requestableScopes: rsScopes.split(/[\s,]+/).filter(Boolean) }, auth))} loading={loading}>
            Run
          </Button>
        </div>
      )}

      {activeOp === 'delete-requestable-scopes' && (
        <div className="space-y-3">
          <Input label="Client ID" value={rsClientId} onChange={(e) => setRsClientId(e.target.value)} placeholder="Client to remove scope restrictions from" />
          <Button onClick={() => handleCall(() => clientService.deleteRequestableScopes(rsClientId, auth))} loading={loading}>Run</Button>
        </div>
      )}

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { ClientManagementSection };
