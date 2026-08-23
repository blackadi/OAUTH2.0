import { useState } from 'react';
import { toast } from 'sonner';
import { adminService } from '@/services';
import { useUrlState } from '@/hooks/useUrlState';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';
import { useCredentials } from '@/context/CredentialContext';

type AdminOp = 'create' | 'list' | 'update' | 'revoke' | 'delete' | 'reissue' | 'local';

/** Every value `AdminOp` can take, as a runtime list — the allowed set for the URL parameter. */
const ALL_OPS = [
  'create',
  'list',
  'update',
  'revoke',
  'delete',
  'reissue',
  'local',
] as const satisfies readonly AdminOp[];

// Every member of Authlete's `GrantType` enum, which is what POST /api/token/create accepts.
// This was a free-text Input, and the server coerced anything it did not recognise to
// AUTHORIZATION_CODE (B1-W3) — so a typo minted a token whose recorded provenance was a fiction.
// The server now answers 400 instead; a Select makes that 400 unreachable from the UI and makes the
// valid set discoverable, which the free-text field never did.
const GRANT_TYPES: { value: string; label: string }[] = [
  { value: 'AUTHORIZATION_CODE', label: 'AUTHORIZATION_CODE' },
  { value: 'CLIENT_CREDENTIALS', label: 'CLIENT_CREDENTIALS' },
  { value: 'REFRESH_TOKEN', label: 'REFRESH_TOKEN' },
  { value: 'PASSWORD', label: 'PASSWORD — ROPC, retired by RFC 9700 §2.4' },
  { value: 'IMPLICIT', label: 'IMPLICIT — retired by RFC 9700 §2.1.2' },
  { value: 'CIBA', label: 'CIBA — urn:openid:params:grant-type:ciba' },
  { value: 'DEVICE_CODE', label: 'DEVICE_CODE — RFC 8628 §3.4' },
  { value: 'TOKEN_EXCHANGE', label: 'TOKEN_EXCHANGE — RFC 8693 §2.1' },
  { value: 'JWT_BEARER', label: 'JWT_BEARER — RFC 7523 §2.1' },
  { value: 'PRE_AUTHORIZED_CODE', label: 'PRE_AUTHORIZED_CODE — OID4VCI' },
];

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
  // The management credential is shared for the page rather than owned here: eight sections
  // held their own copy, and a route change unmounts a section, so it had to be retyped on
  // every navigation.
  const { clientId: authId, clientSecret: authSecret } = useCredentials();
  /**
   * The selected operation lives in the URL, so a specific step can be shared and Back undoes it.
   *
   * Was `useState`, which made a tab invisible to the address bar: *"look at what happened on the
   * introspection step"* could not be communicated, Back left the section rather than undoing the tab,
   * and a reload lost your place mid-protocol. `useUrlState` validates the incoming value against
   * `ALL_OPS`, so a hand-edited query cannot select a tab that does not exist.
   */
  const [activeOp, setActiveOp] = useUrlState<AdminOp>('op', ALL_OPS);
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
  // RFC 9068 §2.2 makes `client_id` REQUIRED; the server 400s without it (9068-W2).
  const [localClientId, setLocalClientId] = useState('');
  const [localScope, setLocalScope] = useState('');

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
    <SectionPanel
      title="Admin Token Management"
      description="Create and manage tokens via the admin API"
    >
      <AdminAuth />

      {error && <ErrorExplainer error={error} className="mb-3" />}

      <TabBar options={ADMIN_OPS} value={activeOp} onChange={setActiveOp} disabled={!auth} />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {activeOp === 'create' && (
        <div className="space-y-3">
          <Select
            label="Grant Type"
            value={createGrant}
            onChange={(e) => setCreateGrant(e.target.value)}
            options={GRANT_TYPES}
          />
          <Input
            label="Subject"
            value={createSubject}
            onChange={(e) => setCreateSubject(e.target.value)}
            placeholder="End-user identifier (optional)"
          />
          <Input
            label="Scopes (comma-separated)"
            value={createScopes}
            onChange={(e) => setCreateScopes(e.target.value)}
            placeholder="e.g. openid,profile,email"
          />
          <Input
            label="Access Token Duration (seconds)"
            value={createDuration}
            onChange={(e) => setCreateDuration(e.target.value)}
            placeholder="Leave empty for service default"
          />
          <Button
            onClick={() =>
              handleCall(() =>
                adminService.createToken(
                  {
                    grantType: createGrant,
                    clientId: authId,
                    subject: createSubject,
                    scopes: createScopes,
                    accessTokenDuration: createDuration,
                  },
                  auth,
                ),
              )
            }
            loading={loading}
          >
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
          <Input
            label="Access Token"
            value={updateToken}
            onChange={(e) => setUpdateToken(e.target.value)}
            placeholder="Full access token value"
          />
          <Input
            label="Scopes (comma-separated)"
            value={updateScopes}
            onChange={(e) => setUpdateScopes(e.target.value)}
            placeholder="New scopes to replace existing"
          />
          <Input
            label="Access Token Expires At (ISO string)"
            value={updateExpiry}
            onChange={(e) => setUpdateExpiry(e.target.value)}
            placeholder="e.g. 2026-12-31T23:59:59Z"
          />
          <Button
            onClick={() =>
              handleCall(() =>
                adminService.updateToken(
                  {
                    accessToken: updateToken,
                    scopes: updateScopes,
                    accessTokenExpiresAt: updateExpiry,
                  },
                  auth,
                ),
              )
            }
            loading={loading}
          >
            Run
          </Button>
        </div>
      )}

      {activeOp === 'revoke' && (
        <div className="space-y-3">
          <Input
            label="Access Token Identifier"
            value={revokeId}
            onChange={(e) => setRevokeId(e.target.value)}
            placeholder="Internal identifier (NOT the token value)"
          />
          <Button
            onClick={() =>
              handleCall(() => adminService.revokeToken({ accessTokenIdentifier: revokeId }, auth))
            }
            loading={loading}
          >
            Run
          </Button>
        </div>
      )}

      {activeOp === 'delete' && (
        <div className="space-y-3">
          <Input
            label="Access Token Identifier"
            value={deleteId}
            onChange={(e) => setDeleteId(e.target.value)}
            placeholder="Internal identifier from List or Create"
          />
          <Button
            onClick={() => handleCall(() => adminService.deleteToken(deleteId, auth))}
            loading={loading}
          >
            Run
          </Button>
        </div>
      )}

      {activeOp === 'reissue' && (
        <div className="space-y-3">
          <Input
            label="Access Token"
            value={reissueAt}
            onChange={(e) => setReissueAt(e.target.value)}
            placeholder="Existing access token"
          />
          <Input
            label="Refresh Token"
            value={reissueRt}
            onChange={(e) => setReissueRt(e.target.value)}
            placeholder="Associated refresh token"
          />
          <Button
            onClick={() =>
              handleCall(() =>
                adminService.reissueToken(
                  { accessToken: reissueAt, refreshToken: reissueRt },
                  auth,
                ),
              )
            }
            loading={loading}
          >
            Run
          </Button>
        </div>
      )}

      {activeOp === 'local' && (
        <div className="space-y-3">
          <Input
            label="Issuer (iss)"
            value={localIss}
            onChange={(e) => setLocalIss(e.target.value)}
            placeholder="Token issuer identifier"
          />
          <Input
            label="Subject (sub)"
            value={localSub}
            onChange={(e) => setLocalSub(e.target.value)}
            placeholder="End-user identifier"
          />
          <Input
            label="Audience (aud)"
            value={localAud}
            onChange={(e) => setLocalAud(e.target.value)}
            placeholder="Target audience"
          />
          <Input
            label="Client ID (client_id)"
            value={localClientId}
            onChange={(e) => setLocalClientId(e.target.value)}
            placeholder="Client the token was issued to"
          />
          <Input
            label="Scope (optional)"
            value={localScope}
            onChange={(e) => setLocalScope(e.target.value)}
            placeholder="e.g. openid profile"
          />
          <p className="text-xs text-muted-foreground -mt-1">
            The token is a worked example of <strong>RFC 9068 §2</strong>: <code>typ: at+jwt</code>{' '}
            plus the seven claims §2.2 marks REQUIRED, which is why <code>client_id</code> is not
            optional here.
            <code>scope</code> is a §2.2.3 SHOULD and is omitted from the token when left blank.
            Development only — the endpoint answers 404 elsewhere, and nothing in this deployment
            accepts the result as an access token.
          </p>
          <Button
            onClick={() =>
              handleCall(() =>
                adminService.localToken(
                  {
                    iss: localIss,
                    sub: localSub,
                    aud: localAud,
                    client_id: localClientId,
                    ...(localScope ? { scope: localScope } : {}),
                  },
                  auth,
                ),
              )
            }
            loading={loading}
          >
            Run
          </Button>
        </div>
      )}

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { AdminSection };
