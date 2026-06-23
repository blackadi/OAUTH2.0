import { useState } from 'react';
import { apiService } from '../services/api';
import { getDoc } from '../data/operationDocs';
import HelpPopover from './HelpPopover';

type DcrOp = 'register' | 'get' | 'update' | 'delete';

const DEFAULT_METADATA = JSON.stringify({
  client_name: 'My DCR Client',
  redirect_uris: ['http://localhost:3001/callback'],
  grant_types: ['AUTHORIZATION_CODE', 'REFRESH_TOKEN'],
  token_endpoint_auth_method: 'CLIENT_SECRET_BASIC',
}, null, 2);

const DcrSection: React.FC = () => {
  const [authId, setAuthId] = useState('');
  const [authSecret, setAuthSecret] = useState('');
  const [activeOp, setActiveOp] = useState<DcrOp | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [regJson, setRegJson] = useState(DEFAULT_METADATA);

  const [regClientId, setRegClientId] = useState('');
  const [regToken, setRegToken] = useState('');

  const [getClientId, setGetClientId] = useState('');
  const [getToken, setGetToken] = useState('');

  const [updateClientId, setUpdateClientId] = useState('');
  const [updateToken, setUpdateToken] = useState('');
  const [updateJson, setUpdateJson] = useState('');

  const [deleteClientId, setDeleteClientId] = useState('');
  const [deleteToken, setDeleteToken] = useState('');

  const auth = btoa(`${authId}:${authSecret}`);
  const doc = activeOp ? getDoc('dcr', activeOp) : undefined;

  const call = async (fn: () => Promise<any>) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fn();
      setResult(res);
      if (activeOp === 'register' && res) {
        const parsed = typeof res.responseContent === 'string'
          ? JSON.parse(res.responseContent)
          : res;
        const clientId = parsed.client_id || parsed.clientId || '';
        const regAccessToken = parsed.registration_access_token || parsed.registrationAccessToken || '';
        if (clientId) setGetClientId(clientId);
        if (regAccessToken) setGetToken(regAccessToken);
        if (clientId) setUpdateClientId(clientId);
        if (regAccessToken) setUpdateToken(regAccessToken);
        if (clientId) setDeleteClientId(clientId);
        if (regAccessToken) setDeleteToken(regAccessToken);
      }
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const active = loading ? 'Loading\u2026' : 'Run';

  const ops: { key: DcrOp; label: string }[] = [
    { key: 'register', label: 'Register' },
    { key: 'get', label: 'Get' },
    { key: 'update', label: 'Update' },
    { key: 'delete', label: 'Delete' },
  ];

  return (
    <div>
      <div className="admin-auth">
        <div className="field"><label className="label">Admin Client ID</label><input className="input" value={authId} onChange={e => setAuthId(e.target.value)} placeholder="MGMT_CLIENT_ID (only needed for Register)" /></div>
        <div className="field"><label className="label">Admin Client Secret</label><input className="input" type="password" value={authSecret} onChange={e => setAuthSecret(e.target.value)} placeholder="MGMT_CLIENT_SECRET (only needed for Register)" /></div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="chip-row">
        {ops.map(op => (
          <button key={op.key} className={`chip ${activeOp === op.key ? 'chip-active' : ''}`}
            onClick={() => setActiveOp(op.key)}>
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

      {activeOp === 'register' && (
        <div>
          <div className="field"><label className="label">Client Metadata (JSON)</label><textarea className="input textarea" rows={10} value={regJson} onChange={e => setRegJson(e.target.value)} placeholder='{"client_name":"My App","redirect_uris":["http://localhost:3001/callback"],"grant_types":["AUTHORIZATION_CODE"]}' /></div>
          <button className="button" onClick={() => call(() => apiService.dcrRegister({ json: regJson }, auth))}>{active}</button>
        </div>
      )}

      {activeOp === 'get' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={getClientId} onChange={e => setGetClientId(e.target.value)} placeholder="client_id from registration" /></div>
          <div className="field"><label className="label">Registration Access Token</label><input className="input" value={getToken} onChange={e => setGetToken(e.target.value)} placeholder="registration_access_token from registration" /></div>
          <button className="button" onClick={() => call(() => apiService.dcrGet(getToken, getClientId))}>{active}</button>
        </div>
      )}

      {activeOp === 'update' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={updateClientId} onChange={e => setUpdateClientId(e.target.value)} placeholder="client_id from registration" /></div>
          <div className="field"><label className="label">Registration Access Token</label><input className="input" value={updateToken} onChange={e => setUpdateToken(e.target.value)} placeholder="registration_access_token from registration" /></div>
          <div className="field"><label className="label">Updated Client Metadata (JSON)</label><textarea className="input textarea" rows={10} value={updateJson} onChange={e => setUpdateJson(e.target.value)} placeholder='{"client_name":"Updated Name","redirect_uris":["http://localhost:3001/callback"]}' /></div>
          <button className="button" onClick={() => call(() => apiService.dcrUpdate(updateJson, updateToken, updateClientId))}>{active}</button>
        </div>
      )}

      {activeOp === 'delete' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={deleteClientId} onChange={e => setDeleteClientId(e.target.value)} placeholder="client_id from registration" /></div>
          <div className="field"><label className="label">Registration Access Token</label><input className="input" value={deleteToken} onChange={e => setDeleteToken(e.target.value)} placeholder="registration_access_token from registration" /></div>
          <button className="button" onClick={() => call(() => apiService.dcrDelete(deleteToken, deleteClientId))}>{active}</button>
        </div>
      )}

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default DcrSection;
