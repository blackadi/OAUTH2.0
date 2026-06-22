import { useState } from 'react';
import {
  AUTHORIZATION_ENDPOINT, CLIENT_ID, DEFAULT_SCOPES, getRedirectUri, CLIENT_SECRET,
} from '../config';
import { createPkcePair } from '../pkce';
import { useToken } from '../context/TokenContext';
import { apiService, type TokenResponse } from '../services/api';

type GrantType = 'authorization_code' | 'client_credentials' | 'password' | 'refresh_token';

const GRANTS: { value: GrantType; label: string }[] = [
  { value: 'authorization_code', label: 'Authorization Code (PKCE)' },
  { value: 'client_credentials', label: 'Client Credentials' },
  { value: 'password', label: 'Password (ROPC)' },
  { value: 'refresh_token', label: 'Refresh Token' },
];

const AuthFlowsSection: React.FC = () => {
  const { tokenSet, setTokenSet } = useToken();
  const [grantType, setGrantType] = useState<GrantType>('authorization_code');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TokenResponse | null>(null);

  const [acId, setAcId] = useState(CLIENT_ID);
  const [acRedirectUri, setAcRedirectUri] = useState(getRedirectUri());

  const [ccId, setCcId] = useState(CLIENT_ID);
  const [ccSecret, setCcSecret] = useState(CLIENT_SECRET);
  const [ccScope, setCcScope] = useState(DEFAULT_SCOPES);

  const [pwUser, setPwUser] = useState('');
  const [pwPass, setPwPass] = useState('');
  const [pwId, setPwId] = useState(CLIENT_ID);
  const [pwSecret, setPwSecret] = useState(CLIENT_SECRET);
  const [pwScope, setPwScope] = useState(DEFAULT_SCOPES);

  const [rtToken, setRtToken] = useState(tokenSet?.refresh_token || '');
  const [rtId, setRtId] = useState(CLIENT_ID);
  const [rtSecret, setRtSecret] = useState(CLIENT_SECRET);

  const startAuthCode = async () => {
    setError(null);
    setLoading(true);
    try {
      const { codeVerifier, codeChallenge } = await createPkcePair();
      const state = crypto.randomUUID();
      const nonce = crypto.randomUUID();
      sessionStorage.setItem('pkce_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);
      sessionStorage.setItem('authz_client_id', acId);
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: acId,
        redirect_uri: acRedirectUri,
        scope: DEFAULT_SCOPES,
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      window.location.href = `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
    } catch (e: any) {
      setError(e?.message || 'Failed to initiate auth code flow');
      setLoading(false);
    }
  };

  const saveClientCredentials = (clientId: string, clientSecret: string) => {
    sessionStorage.setItem('active_client_id', clientId);
    if (clientSecret) sessionStorage.setItem('active_client_secret', clientSecret);
  };

  const callToken = async (clientId: string, clientSecret: string, fn: () => Promise<TokenResponse>) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fn();
      setResult(res);
      setTokenSet(res);
      saveClientCredentials(clientId, clientSecret);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="radio-group">
        {GRANTS.map(g => (
          <label key={g.value} className="radio-label">
            <input type="radio" name="grant" value={g.value} checked={grantType === g.value}
              onChange={() => setGrantType(g.value)} />
            {g.label}
          </label>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {grantType === 'authorization_code' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={acId} onChange={e => setAcId(e.target.value)} /></div>
          <div className="field"><label className="label">Redirect URI</label><input className="input" value={acRedirectUri} onChange={e => setAcRedirectUri(e.target.value)} /></div>
          <button className="button" onClick={startAuthCode} disabled={loading}>
            {loading ? 'Redirecting…' : 'Start Authorization Code Flow'}
          </button>
        </div>
      )}

      {grantType === 'client_credentials' && (
        <div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={ccId} onChange={e => setCcId(e.target.value)} /></div>
          <div className="field"><label className="label">Client Secret</label><input className="input" type="password" value={ccSecret} onChange={e => setCcSecret(e.target.value)} /></div>
          <div className="field"><label className="label">Scope</label><input className="input" value={ccScope} onChange={e => setCcScope(e.target.value)} /></div>
          <button className="button" onClick={() => callToken(ccId, ccSecret, () => apiService.clientCredentials(ccId, ccSecret, ccScope))} disabled={loading}>
            {loading ? 'Loading…' : 'Get Token'}
          </button>
        </div>
      )}

      {grantType === 'password' && (
        <div>
          <div className="field"><label className="label">Username</label><input className="input" value={pwUser} onChange={e => setPwUser(e.target.value)} /></div>
          <div className="field"><label className="label">Password</label><input className="input" type="password" value={pwPass} onChange={e => setPwPass(e.target.value)} /></div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={pwId} onChange={e => setPwId(e.target.value)} /></div>
          <div className="field"><label className="label">Client Secret</label><input className="input" type="password" value={pwSecret} onChange={e => setPwSecret(e.target.value)} /></div>
          <div className="field"><label className="label">Scope</label><input className="input" value={pwScope} onChange={e => setPwScope(e.target.value)} /></div>
          <button className="button" onClick={() => callToken(pwId, pwSecret, () => apiService.passwordGrant(pwUser, pwPass, pwId, pwSecret, pwScope))} disabled={loading}>
            {loading ? 'Loading…' : 'Get Token'}
          </button>
        </div>
      )}

      {grantType === 'refresh_token' && (
        <div>
          <div className="field"><label className="label">Refresh Token</label><input className="input" value={rtToken} onChange={e => setRtToken(e.target.value)} /></div>
          <div className="field"><label className="label">Client ID</label><input className="input" value={rtId} onChange={e => setRtId(e.target.value)} /></div>
          <div className="field"><label className="label">Client Secret</label><input className="input" type="password" value={rtSecret} onChange={e => setRtSecret(e.target.value)} /></div>
          <button className="button" onClick={() => callToken(rtId, rtSecret, () => apiService.refreshToken(rtToken, rtId, rtSecret))} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh Token'}
          </button>
        </div>
      )}

      {result && <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
};

export default AuthFlowsSection;
