import { useState } from 'react';
import { apiService } from '../services/api';
import { getDoc } from '../data/operationDocs';
import HelpPopover from './HelpPopover';

type ClientOp = 'list' | 'get' | 'create' | 'update' | 'delete' | 'lock' | 'unlock' | 'refresh-secret' | 'update-secret'
  | 'list-auth' | 'update-auth' | 'delete-auth' | 'get-granted-scopes' | 'delete-granted-scopes'
  | 'get-requestable-scopes' | 'update-requestable-scopes' | 'delete-requestable-scopes';

const CLIENT_TYPES = ['CONFIDENTIAL', 'PUBLIC'];
const APP_TYPES = ['web', 'native'];
const GRANT_TYPES = [
  'AUTHORIZATION_CODE', 'IMPLICIT', 'PASSWORD', 'CLIENT_CREDENTIALS',
  'REFRESH_TOKEN', 'JWT_BEARER', 'TOKEN_EXCHANGE', 'DEVICE_CODE',
];
const RESPONSE_TYPES = ['code', 'token', 'id_token', 'code token', 'code id_token', 'token id_token', 'code token id_token', 'none'];
const AUTH_METHODS = ['NONE', 'CLIENT_SECRET_BASIC', 'CLIENT_SECRET_POST', 'CLIENT_SECRET_JWT', 'PRIVATE_KEY_JWT', 'SELF_SIGNED_TLS_CLIENT_AUTH', 'TLS_CLIENT_AUTH'];

const ClientManagementSection: React.FC = () => {
  const [authId, setAuthId] = useState('');
  const [authSecret, setAuthSecret] = useState('');
  const [activeOp, setActiveOp] = useState<ClientOp | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [listStart, setListStart] = useState('0');
  const [listEnd, setListEnd] = useState('20');

  const [getClientId, setGetClientId] = useState('');

  const [createClientName, setCreateClientName] = useState('');
  const [createClientType, setCreateClientType] = useState('CONFIDENTIAL');
  const [createAppType, setCreateAppType] = useState('web');
  const [createGrantTypes, setCreateGrantTypes] = useState('AUTHORIZATION_CODE');
  const [createResponseTypes, setCreateResponseTypes] = useState('code');
  const [createRedirectUris, setCreateRedirectUris] = useState('');
  const [createTokenAuthMethod, setCreateTokenAuthMethod] = useState('CLIENT_SECRET_BASIC');
  const [createDescription, setCreateDescription] = useState('');
  const [createDeveloper, setCreateDeveloper] = useState('');

  const [updateClientId, setUpdateClientId] = useState('');
  const [updateClientName, setUpdateClientName] = useState('');
  const [updateDescription, setUpdateDescription] = useState('');
  const [updateRedirectUris, setUpdateRedirectUris] = useState('');

  const [deleteClientId, setDeleteClientId] = useState('');

  const [flagClientId, setFlagClientId] = useState('');

  const [refreshClientId, setRefreshClientId] = useState('');

  const [secretClientId, setSecretClientId] = useState('');
  const [newSecret, setNewSecret] = useState('');

  const [authSubject, setAuthSubject] = useState('');
  const [authUpdateClientId, setAuthUpdateClientId] = useState('');
  const [authUpdateSubject, setAuthUpdateSubject] = useState('');
  const [authUpdateScopes, setAuthUpdateScopes] = useState('');
  const [authDeleteClientId, setAuthDeleteClientId] = useState('');
  const [authDeleteSubject, setAuthDeleteSubject] = useState('');

  const [gsClientId, setGsClientId] = useState('');
  const [gsSubject, setGsSubject] = useState('');
  const [dgsClientId, setDgsClientId] = useState('');
  const [dgsSubject, setDgsSubject] = useState('');

  const [rsClientId, setRsClientId] = useState('');
  const [rsScopes, setRsScopes] = useState('');
  const [drsClientId, setDrsClientId] = useState('');

  const auth = btoa(`${authId}:${authSecret}`);
  const doc = activeOp ? getDoc('client', activeOp) : undefined;

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

  const active = loading ? 'Loading\u2026' : 'Run';

  const ops: { key: ClientOp; label: string; group: string }[] = [
    { key: 'list', label: 'List', group: 'basic' },
    { key: 'get', label: 'Get', group: 'basic' },
    { key: 'create', label: 'Create', group: 'basic' },
    { key: 'update', label: 'Update', group: 'basic' },
    { key: 'delete', label: 'Delete', group: 'basic' },
    { key: 'lock', label: 'Lock', group: 'basic' },
    { key: 'unlock', label: 'Unlock', group: 'basic' },
    { key: 'refresh-secret', label: 'Refresh Secret', group: 'basic' },
    { key: 'update-secret', label: 'Update Secret', group: 'basic' },
    { key: 'list-auth', label: 'List Auth', group: 'mgmt' },
    { key: 'update-auth', label: 'Update Auth', group: 'mgmt' },
    { key: 'delete-auth', label: 'Delete Auth', group: 'mgmt' },
    { key: 'get-granted-scopes', label: 'Get Granted Scopes', group: 'mgmt' },
    { key: 'delete-granted-scopes', label: 'Delete Granted Scopes', group: 'mgmt' },
    { key: 'get-requestable-scopes', label: 'Get Requestable Scopes', group: 'mgmt' },
    { key: 'update-requestable-scopes', label: 'Update Requestable Scopes', group: 'mgmt' },
    { key: 'delete-requestable-scopes', label: 'Delete Requestable Scopes', group: 'mgmt' },
  ];

  return (
    <div>
      <div className="admin-auth">
        <div className="field"><label className="label">Admin Client ID</label><input className="input" value={authId} onChange={e => setAuthId(e.target.value)} placeholder="MGMT_CLIENT_ID" /></div>
        <div className="field"><label className="label">Admin Client Secret</label><input className="input" type="password" value={authSecret} onChange={e => setAuthSecret(e.target.value)} placeholder="MGMT_CLIENT_SECRET" /></div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="chip-row">
        {ops.filter(o => o.group === 'basic').map(op => (
          <button key={op.key} className={`chip ${activeOp === op.key ? 'chip-active' : ''}`}
            onClick={() => setActiveOp(op.key)} disabled={!authId || !authSecret}>
            {op.label}
          </button>
        ))}
      </div>
      <div className="chip-row" style={{ marginTop: 8 }}>
        <span className="label" style={{ marginRight: 8, lineHeight: '32px' }}>Advanced:</span>
        {ops.filter(o => o.group === 'mgmt').map(op => (
          <button key={op.key} className={`chip ${activeOp === op.key ? 'chip-active' : ''}`}
            onClick={() => setActiveOp(op.key)} disabled={!authId || !authSecret}>
            {op.label}
          </button>
        ))}
      </div>

      {activeOp && doc && (
        <div className="op-description">
          <span className="op-description-text">{doc.description}</span>
          <HelpPopover title={doc.title} description={doc.description} params={doc.params} returns={doc.returns} tips={doc.tips} />
        </div>
      )}

      {activeOp === 'list' && (
        <div>
          <div className="field"><label className="label">Start (inclusive)</label><input className="input" value={listStart} onChange={e => setListStart(e.target.value)} placeholder="0" /></div>
          <div className="field"><label className="label">End (exclusive)</label><input className="input" value={listEnd} onChange={e => setListEnd(e.target.value)} placeholder="20" /></div>
          <button className="button" onClick={() => call(() => apiService.clientList(auth, Number(listStart), Number(listEnd)))}>{active}</button>
        </div>
      )}

      {activeOp === 'get' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={getClientId} onChange={e => setGetClientId(e.target.value)} placeholder="Numeric client ID from Authlete" /></div>
          <button className="button" onClick={() => call(() => apiService.clientGet(getClientId, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'create' && (
        <div>
          <div className="field"><label className="label">Client Name</label><input className="input" value={createClientName} onChange={e => setCreateClientName(e.target.value)} placeholder="e.g. My App" /></div>
          <div className="field"><label className="label">Client Type</label>
            <select className="input" value={createClientType} onChange={e => setCreateClientType(e.target.value)}>
              {CLIENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Application Type</label>
            <select className="input" value={createAppType} onChange={e => setCreateAppType(e.target.value)}>
              {APP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Grant Types (comma-separated)</label>
            <input className="input" value={createGrantTypes} onChange={e => setCreateGrantTypes(e.target.value)} placeholder="e.g. AUTHORIZATION_CODE,REFRESH_TOKEN" />
          </div>
          <div className="field"><label className="label">Response Types (space-separated)</label>
            <input className="input" value={createResponseTypes} onChange={e => setCreateResponseTypes(e.target.value)} placeholder="e.g. code" />
          </div>
          <div className="field"><label className="label">Redirect URIs (space-separated)</label><input className="input" value={createRedirectUris} onChange={e => setCreateRedirectUris(e.target.value)} placeholder="https://your-app.com/callback" /></div>
          <div className="field"><label className="label">Token Auth Method</label>
            <select className="input" value={createTokenAuthMethod} onChange={e => setCreateTokenAuthMethod(e.target.value)}>
              {AUTH_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Description</label><input className="input" value={createDescription} onChange={e => setCreateDescription(e.target.value)} placeholder="Optional description" /></div>
          <div className="field"><label className="label">Developer</label><input className="input" value={createDeveloper} onChange={e => setCreateDeveloper(e.target.value)} placeholder="Optional developer identifier" /></div>
          <button className="button" onClick={() => call(() => apiService.clientCreate({
            client: {
              clientName: createClientName,
              clientType: createClientType,
              applicationType: createAppType,
              grantTypes: createGrantTypes.split(/[\s,]+/).filter(Boolean),
              responseTypes: createResponseTypes.split(/[\s,]+/).filter(Boolean),
              redirectUris: createRedirectUris.split(/[\s,]+/).filter(Boolean),
              tokenAuthMethod: createTokenAuthMethod,
              description: createDescription,
              developer: createDeveloper,
            },
          }, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'update' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={updateClientId} onChange={e => setUpdateClientId(e.target.value)} placeholder="Numeric client ID to update" /></div>
          <div className="field"><label className="label">Client Name</label><input className="input" value={updateClientName} onChange={e => setUpdateClientName(e.target.value)} placeholder="New name (leave empty to keep)" /></div>
          <div className="field"><label className="label">Description</label><input className="input" value={updateDescription} onChange={e => setUpdateDescription(e.target.value)} placeholder="New description (leave empty to keep)" /></div>
          <div className="field"><label className="label">Redirect URIs (space-separated)</label><input className="input" value={updateRedirectUris} onChange={e => setUpdateRedirectUris(e.target.value)} placeholder="https://your-app.com/callback" /></div>
          <button className="button" onClick={() => call(() => apiService.clientUpdate(updateClientId, {
            client: {
              clientName: updateClientName || undefined,
              description: updateDescription || undefined,
              redirectUris: updateRedirectUris ? updateRedirectUris.split(/[\s,]+/).filter(Boolean) : undefined,
            },
          }, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'delete' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={deleteClientId} onChange={e => setDeleteClientId(e.target.value)} placeholder="Numeric client ID to permanently delete" /></div>
          <button className="button" onClick={() => call(() => apiService.clientDelete(deleteClientId, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'lock' && (
        <div>
          <div className="field"><label className="label">Client ID / Alias</label><input className="input" value={flagClientId} onChange={e => setFlagClientId(e.target.value)} placeholder="Client ID to suspend" /></div>
          <button className="button" onClick={() => call(() => apiService.clientLockFlag(flagClientId, true, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'unlock' && (
        <div>
          <div className="field"><label className="label">Client ID / Alias</label><input className="input" value={flagClientId} onChange={e => setFlagClientId(e.target.value)} placeholder="Client ID to restore" /></div>
          <button className="button" onClick={() => call(() => apiService.clientLockFlag(flagClientId, false, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'refresh-secret' && (
        <div>
          <div className="field"><label className="label">Client ID / Alias</label><input className="input" value={refreshClientId} onChange={e => setRefreshClientId(e.target.value)} placeholder="Client ID to rotate secret for" /></div>
          <button className="button" onClick={() => call(() => apiService.clientRefreshSecret(refreshClientId, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'update-secret' && (
        <div>
          <div className="field"><label className="label">Client ID / Alias</label><input className="input" value={secretClientId} onChange={e => setSecretClientId(e.target.value)} placeholder="Client ID to set secret for" /></div>
          <div className="field"><label className="label">New Client Secret</label><input className="input" value={newSecret} onChange={e => setNewSecret(e.target.value)} placeholder="A-Z, a-z, 0-9, -, _ (max 86 chars)" /></div>
          <button className="button" onClick={() => call(() => apiService.clientUpdateSecret(secretClientId, newSecret, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'list-auth' && (
        <div>
          <div className="field"><label className="label">Subject (user ID)</label><input className="input" value={authSubject} onChange={e => setAuthSubject(e.target.value)} placeholder="End-user identifier" /></div>
          <button className="button" onClick={() => call(() => apiService.clientListAuth(authSubject, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'update-auth' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={authUpdateClientId} onChange={e => setAuthUpdateClientId(e.target.value)} placeholder="Client to update authorizations for" /></div>
          <div className="field"><label className="label">Subject (user ID)</label><input className="input" value={authUpdateSubject} onChange={e => setAuthUpdateSubject(e.target.value)} placeholder="End-user identifier" /></div>
          <div className="field"><label className="label">Scopes (space-separated)</label><input className="input" value={authUpdateScopes} onChange={e => setAuthUpdateScopes(e.target.value)} placeholder="New scopes for existing tokens" /></div>
          <button className="button" onClick={() => call(() => apiService.clientUpdateAuth(authUpdateClientId, {
            subject: authUpdateSubject, scopes: authUpdateScopes,
          }, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'delete-auth' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={authDeleteClientId} onChange={e => setAuthDeleteClientId(e.target.value)} placeholder="Client to revoke authorizations for" /></div>
          <div className="field"><label className="label">Subject (user ID)</label><input className="input" value={authDeleteSubject} onChange={e => setAuthDeleteSubject(e.target.value)} placeholder="End-user identifier" /></div>
          <button className="button" onClick={() => call(() => apiService.clientDeleteAuth(authDeleteClientId, authDeleteSubject, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'get-granted-scopes' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={gsClientId} onChange={e => setGsClientId(e.target.value)} placeholder="Client to inspect scopes for" /></div>
          <div className="field"><label className="label">Subject (user ID)</label><input className="input" value={gsSubject} onChange={e => setGsSubject(e.target.value)} placeholder="End-user identifier" /></div>
          <button className="button" onClick={() => call(() => apiService.clientGetGrantedScopes(gsClientId, gsSubject, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'delete-granted-scopes' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={dgsClientId} onChange={e => setDgsClientId(e.target.value)} placeholder="Client to clear scopes for" /></div>
          <div className="field"><label className="label">Subject (user ID)</label><input className="input" value={dgsSubject} onChange={e => setDgsSubject(e.target.value)} placeholder="End-user identifier" /></div>
          <button className="button" onClick={() => call(() => apiService.clientDeleteGrantedScopes(dgsClientId, dgsSubject, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'get-requestable-scopes' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={rsClientId} onChange={e => setRsClientId(e.target.value)} placeholder="Client to check scope restrictions for" /></div>
          <button className="button" onClick={() => call(() => apiService.clientGetRequestableScopes(rsClientId, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'update-requestable-scopes' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={rsClientId} onChange={e => setRsClientId(e.target.value)} placeholder="Client to restrict scopes for" /></div>
          <div className="field"><label className="label">Scopes (space-separated)</label><input className="input" value={rsScopes} onChange={e => setRsScopes(e.target.value)} placeholder="Allowed scopes (empty = unrestricted)" /></div>
          <button className="button" onClick={() => call(() => apiService.clientUpdateRequestableScopes(rsClientId, {
            requestableScopes: rsScopes.split(/[\s,]+/).filter(Boolean),
          }, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'delete-requestable-scopes' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={drsClientId} onChange={e => setDrsClientId(e.target.value)} placeholder="Client to remove scope restrictions from" /></div>
          <button className="button" onClick={() => call(() => apiService.clientDeleteRequestableScopes(drsClientId, auth))}>{active}</button>
        </div>
      )}

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default ClientManagementSection;
