import { useState } from 'react';
import { apiService } from '../services/api';

type AdminOp = 'create' | 'list' | 'update' | 'revoke' | 'delete' | 'reissue' | 'local';

const AdminSection: React.FC = () => {
  const [authId, setAuthId] = useState('');
  const [authSecret, setAuthSecret] = useState('');
  const [activeOp, setActiveOp] = useState<AdminOp | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

  const auth = btoa(`${authId}:${authSecret}`);

  const call = async (fn: () => Promise<any>) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fn();
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const active = loading ? 'Loading…' : 'Run';

  const ops: { key: AdminOp; label: string }[] = [
    { key: 'create', label: 'Create' },
    { key: 'list', label: 'List' },
    { key: 'update', label: 'Update' },
    { key: 'revoke', label: 'Revoke' },
    { key: 'delete', label: 'Delete' },
    { key: 'reissue', label: 'Reissue' },
    { key: 'local', label: 'Local JWT' },
  ];

  return (
    <div>
      <div className="admin-auth">
        <div className="field"><label className="label">Admin Client ID</label><input className="input" value={authId} onChange={e => setAuthId(e.target.value)} placeholder="MGMT_CLIENT_ID" /></div>
        <div className="field"><label className="label">Admin Client Secret</label><input className="input" type="password" value={authSecret} onChange={e => setAuthSecret(e.target.value)} placeholder="MGMT_CLIENT_SECRET" /></div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="chip-row">
        {ops.map(op => (
          <button key={op.key} className={`chip ${activeOp === op.key ? 'chip-active' : ''}`}
            onClick={() => setActiveOp(op.key)} disabled={!authId || !authSecret}>
            {op.label}
          </button>
        ))}
      </div>

      {activeOp === 'create' && (
        <div>
          <div className="field"><label className="label">Grant Type</label><input className="input" value={createGrant} onChange={e => setCreateGrant(e.target.value)} /></div>
          <div className="field"><label className="label">Subject</label><input className="input" value={createSubject} onChange={e => setCreateSubject(e.target.value)} /></div>
          <div className="field"><label className="label">Scopes (comma-separated)</label><input className="input" value={createScopes} onChange={e => setCreateScopes(e.target.value)} /></div>
          <div className="field"><label className="label">Access Token Duration (seconds)</label><input className="input" value={createDuration} onChange={e => setCreateDuration(e.target.value)} /></div>
          <button className="button" onClick={() => call(() => apiService.adminCreate({
            grantType: createGrant, clientId: authId, subject: createSubject,
            scopes: createScopes, accessTokenDuration: createDuration,
          }, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'list' && (
        <button className="button" onClick={() => call(() => apiService.adminList(auth))}>{active}</button>
      )}

      {activeOp === 'update' && (
        <div>
          <div className="field"><label className="label">Access Token</label><input className="input" value={updateToken} onChange={e => setUpdateToken(e.target.value)} /></div>
          <div className="field"><label className="label">Scopes (comma-separated)</label><input className="input" value={updateScopes} onChange={e => setUpdateScopes(e.target.value)} /></div>
          <div className="field"><label className="label">Access Token Expires At (ISO string)</label><input className="input" value={updateExpiry} onChange={e => setUpdateExpiry(e.target.value)} /></div>
          <button className="button" onClick={() => call(() => apiService.adminUpdate({
            accessToken: updateToken, scopes: updateScopes, accessTokenExpiresAt: updateExpiry,
          }, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'revoke' && (
        <div>
          <div className="field"><label className="label">Access Token Identifier</label><input className="input" value={revokeId} onChange={e => setRevokeId(e.target.value)} /></div>
          <button className="button" onClick={() => call(() => apiService.adminRevoke({ accessTokenIdentifier: revokeId }, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'delete' && (
        <div>
          <div className="field"><label className="label">Access Token Identifier</label><input className="input" value={deleteId} onChange={e => setDeleteId(e.target.value)} /></div>
          <button className="button" onClick={() => call(() => apiService.adminDelete(deleteId, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'reissue' && (
        <div>
          <div className="field"><label className="label">Access Token</label><input className="input" value={reissueAt} onChange={e => setReissueAt(e.target.value)} /></div>
          <div className="field"><label className="label">Refresh Token</label><input className="input" value={reissueRt} onChange={e => setReissueRt(e.target.value)} /></div>
          <button className="button" onClick={() => call(() => apiService.adminReissue({ accessToken: reissueAt, refreshToken: reissueRt }, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'local' && (
        <div>
          <div className="field"><label className="label">Issuer (iss)</label><input className="input" value={localIss} onChange={e => setLocalIss(e.target.value)} /></div>
          <div className="field"><label className="label">Subject (sub)</label><input className="input" value={localSub} onChange={e => setLocalSub(e.target.value)} /></div>
          <div className="field"><label className="label">Audience (aud)</label><input className="input" value={localAud} onChange={e => setLocalAud(e.target.value)} /></div>
          <button className="button" onClick={() => call(() => apiService.adminLocalToken({ iss: localIss, sub: localSub, aud: localAud }))}>{active}</button>
        </div>
      )}

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default AdminSection;
