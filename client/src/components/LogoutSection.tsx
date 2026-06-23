import { useState } from 'react';
import { LOGOUT_ENDPOINT } from '../config';
import { useToken } from '../context/TokenContext';
import { getDoc } from '../data/operationDocs';
import HelpPopover from './HelpPopover';

const LogoutSection: React.FC = () => {
  const { tokenSet, clearTokens } = useToken();
  const [idTokenHint, setIdTokenHint] = useState(tokenSet?.id_token || '');
  const [postLogoutUri, setPostLogoutUri] = useState('http://localhost:3001');
  const [state, setState] = useState(() => crypto.randomUUID());

  const doc = getDoc('logout', 'logout');

  const startLogout = () => {
    clearTokens();
    const params = new URLSearchParams();
    if (idTokenHint) params.set('id_token_hint', idTokenHint);
    if (postLogoutUri) params.set('post_logout_redirect_uri', postLogoutUri);
    if (state) params.set('state', state);
    window.location.href = `${LOGOUT_ENDPOINT}?${params.toString()}`;
  };

  return (
    <div>
      {doc && (
        <div className="op-description">
          <span className="op-description-text">{doc.description}</span>
          <HelpPopover title={doc.title} description={doc.description} params={doc.params} returns={doc.returns} tips={doc.tips} />
        </div>
      )}

      <div className="field"><label className="label">ID Token Hint</label><input className="input" value={idTokenHint} onChange={e => setIdTokenHint(e.target.value)} placeholder="ID token identifying the session to end" /></div>
      <div className="field"><label className="label">Post-Logout Redirect URI</label><input className="input" value={postLogoutUri} onChange={e => setPostLogoutUri(e.target.value)} placeholder="Must be in the allowed origins list" /></div>
      <div className="field"><label className="label">State</label><input className="input" value={state} onChange={e => setState(e.target.value)} placeholder="CSRF protection value" /></div>
      <button className="button" onClick={startLogout}>RP-Initiated Logout</button>
      <p className="small">This will navigate away from the app. Tokens will be cleared on logout.</p>
    </div>
  );
};

export default LogoutSection;
