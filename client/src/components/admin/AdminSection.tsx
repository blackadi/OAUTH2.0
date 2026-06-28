import { useState } from 'react';
import { toast } from 'sonner';
import { adminService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';

type AdminOp = 'create' | 'list' | 'update' | 'revoke' | 'delete' | 'reissue' | 'local';

const ADMIN_OPS: { value: AdminOp; label: string }[] = [
  { value: 'create', label: 'Create' },
  { value: 'list', label: 'List' },
  { value: 'update', label: 'Update' },
  { value: 'revoke', label: 'Revoke' },
  { value: 'delete', label: 'Delete' },
  { value: 'reissue', label: 'Reissue' },
  { value: 'local', label: 'Local JWT' },
];

function AdminSection() {
  const [authId, setAuthId] = useState('');
  const [authSecret, setAuthSecret] = useState('');
  const [activeOp, setActiveOp] = useState<AdminOp | null>(null);
  const { loading, result, error, call } = useAsyncCall();

  const [createGrant, setCreateGrant] = useState('AUTHORIZATION_CODE');
  const [createSubject, setCreateSubject] = useState('');
  const [createScopes, setCreateScopes] = useState('');
  const [createDuration, setCreateDuration] = useState('');

  const [updateToken, setUpdateToken] = useState('');
  const [updateScopes, setUpdateScopes] = useState('');
  const [updateExpiry, setUpdateExpiry] = useState('');

  const [revokeId, setRevokeId] = useState('');
  const [deleteId, setDeleteId] = useState('');

  const [reissueAt, setReissueAt] = useState('');
  const [reissueRt, setReissueRt] = useState('');

  const [localIss, setLocalIss] = useState('');
  const [localSub, setLocalSub] = useState('');
  const [localAud, setLocalAud] = useState('');

  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';
  const doc = activeOp ? getDoc('admin', activeOp) : undefined;

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) {
      toast.success(`${activeOp} completed`);
    } else {
      toast.error(err);
    }
  };

  return (
    <SectionPanel title="Admin Token Management" description="Create and manage tokens via the admin API">
      <AdminAuth clientId={authId} clientSecret={authSecret} onClientIdChange={setAuthId} onClientSecretChange={setAuthSecret} />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <TabBar options={ADMIN_OPS} value={activeOp} onChange={setActiveOp} disabled={!auth} />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {activeOp === 'create' && (
        <div className="space-y-3">
          <Input label="Grant Type" value={createGrant} onChange={(e) => setCreateGrant(e.target.value)} placeholder="e.g. AUTHORIZATION_CODE, CLIENT_CREDENTIALS" />
          <Input label="Subject" value={createSubject} onChange={(e) => setCreateSubject(e.target.value)} placeholder="End-user identifier (optional)" />
          <Input label="Scopes (comma-separated)" value={createScopes} onChange={(e) => setCreateScopes(e.target.value)} placeholder="e.g. openid,profile,email" />
          <Input label="Access Token Duration (seconds)" value={createDuration} onChange={(e) => setCreateDuration(e.target.value)} placeholder="Leave empty for service default" />
          <Button onClick={() => handleCall(() => adminService.createToken({ grantType: createGrant, clientId: authId, subject: createSubject, scopes: createScopes, accessTokenDuration: createDuration }, auth))} loading={loading}>
            Run
          </Button>
        </div>
      )}

      {activeOp === 'list' && (
        <Button onClick={() => handleCall(() => adminService.listTokens(auth))} loading={loading}>
          Run
        </Button>
      )}

      {activeOp === 'update' && (
        <div className="space-y-3">
          <Input label="Access Token" value={updateToken} onChange={(e) => setUpdateToken(e.target.value)} placeholder="Full access token value" />
          <Input label="Scopes (comma-separated)" value={updateScopes} onChange={(e) => setUpdateScopes(e.target.value)} placeholder="New scopes to replace existing" />
          <Input label="Access Token Expires At (ISO string)" value={updateExpiry} onChange={(e) => setUpdateExpiry(e.target.value)} placeholder="e.g. 2026-12-31T23:59:59Z" />
          <Button onClick={() => handleCall(() => adminService.updateToken({ accessToken: updateToken, scopes: updateScopes, accessTokenExpiresAt: updateExpiry }, auth))} loading={loading}>
            Run
          </Button>
        </div>
      )}

      {activeOp === 'revoke' && (
        <div className="space-y-3">
          <Input label="Access Token Identifier" value={revokeId} onChange={(e) => setRevokeId(e.target.value)} placeholder="Internal identifier (NOT the token value)" />
          <Button onClick={() => handleCall(() => adminService.revokeToken({ accessTokenIdentifier: revokeId }, auth))} loading={loading}>
            Run
          </Button>
        </div>
      )}

      {activeOp === 'delete' && (
        <div className="space-y-3">
          <Input label="Access Token Identifier" value={deleteId} onChange={(e) => setDeleteId(e.target.value)} placeholder="Internal identifier from List or Create" />
          <Button onClick={() => handleCall(() => adminService.deleteToken(deleteId, auth))} loading={loading}>
            Run
          </Button>
        </div>
      )}

      {activeOp === 'reissue' && (
        <div className="space-y-3">
          <Input label="Access Token" value={reissueAt} onChange={(e) => setReissueAt(e.target.value)} placeholder="Existing access token" />
          <Input label="Refresh Token" value={reissueRt} onChange={(e) => setReissueRt(e.target.value)} placeholder="Associated refresh token" />
          <Button onClick={() => handleCall(() => adminService.reissueToken({ accessToken: reissueAt, refreshToken: reissueRt }, auth))} loading={loading}>
            Run
          </Button>
        </div>
      )}

      {activeOp === 'local' && (
        <div className="space-y-3">
          <Input label="Issuer (iss)" value={localIss} onChange={(e) => setLocalIss(e.target.value)} placeholder="Token issuer identifier" />
          <Input label="Subject (sub)" value={localSub} onChange={(e) => setLocalSub(e.target.value)} placeholder="End-user identifier" />
          <Input label="Audience (aud)" value={localAud} onChange={(e) => setLocalAud(e.target.value)} placeholder="Target audience" />
          <Button onClick={() => handleCall(() => adminService.localToken({ iss: localIss, sub: localSub, aud: localAud }))} loading={loading}>
            Run
          </Button>
        </div>
      )}

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { AdminSection };
