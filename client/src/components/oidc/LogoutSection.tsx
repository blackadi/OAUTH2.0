import { useState } from 'react';
import { LOGOUT_ENDPOINT, CLIENT_ID } from '@/config';
import { useToken } from '@/context/TokenContext';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

function LogoutSection() {
  const { tokenSet, clearTokens } = useToken();
  const [idTokenHint, setIdTokenHint] = useState(tokenSet?.id_token || '');
  const [postLogoutUri, setPostLogoutUri] = useState(() => window.location.origin);
  const [state, setState] = useState<string>(() => crypto.randomUUID());

  const doc = getDoc('logout', 'logout');

  const startLogout = () => {
    clearTokens();
    const params = new URLSearchParams();
    if (idTokenHint) params.set('id_token_hint', idTokenHint);
    if (postLogoutUri) params.set('post_logout_redirect_uri', postLogoutUri);
    if (state) params.set('state', state);
    if (CLIENT_ID && CLIENT_ID !== 'your_client_id') params.set('client_id', CLIENT_ID);
    window.location.href = `${LOGOUT_ENDPOINT}?${params.toString()}`;
  };

  return (
    <SectionPanel title="RP-Initiated Logout" description="OpenID Connect RP-Initiated Logout 1.0">
      {doc && <OperationDescription doc={doc} />}

      <div className="space-y-3">
        <Input label="ID Token Hint" value={idTokenHint} onChange={(e) => setIdTokenHint(e.target.value)} placeholder="ID token identifying the session to end" />
        <Input label="Post-Logout Redirect URI" value={postLogoutUri} onChange={(e) => setPostLogoutUri(e.target.value)} placeholder="Must exactly match a URI registered for this client" />
        <Input label="State" value={state} onChange={(e) => setState(e.target.value)} placeholder="CSRF protection value" />
        <Button variant="danger" onClick={startLogout}>
          RP-Initiated Logout
        </Button>
        <p className="text-xs text-muted-foreground">
          This navigates away from the app and lands on the server's confirmation page — RP-Initiated Logout
          1.0 §2 requires the OP to ask before ending the session. Nothing is signed out until you confirm
          there. Tokens are cleared here immediately.
        </p>
        <p className="text-xs text-muted-foreground">
          You are only redirected back if the URI above exactly matches one registered for this client (§3).
          The client comes from the Client ID, or from the ID token hint's <code>aud</code> when no Client ID
          is set — with neither, logout still succeeds but ends on the server's signed-out page.
        </p>
      </div>
    </SectionPanel>
  );
}

export { LogoutSection };
