import { useState, useId } from 'react';
import { LOGOUT_ENDPOINT, CLIENT_ID } from '@/config';
import { navigateTo } from '@/services/trace-store';
import { useToken } from '@/context/TokenContext';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import '@/styles/transcript.css';

/**
 * RP-Initiated Logout, rendered as the exchange it is — the same conversion `ParSection` and its
 * siblings had, for a flow that is a single front-channel hop with no back-channel turn at all.
 *
 * **Behaviour is unchanged.** `startLogout` is the incumbent implementation; only the markup changed.
 */
function LogoutSection() {
  const { tokenSet, clearTokens } = useToken();
  const [idTokenHint, setIdTokenHint] = useState(tokenSet?.id_token || '');
  const [postLogoutUri, setPostLogoutUri] = useState(() => window.location.origin);
  const [state, setState] = useState<string>(() => crypto.randomUUID());

  const doc = getDoc('logout', 'logout');
  const uid = useId();

  const startLogout = () => {
    clearTokens();
    const params = new URLSearchParams();
    if (idTokenHint) params.set('id_token_hint', idTokenHint);
    if (postLogoutUri) params.set('post_logout_redirect_uri', postLogoutUri);
    if (state) params.set('state', state);
    if (CLIENT_ID && CLIENT_ID !== 'your_client_id') params.set('client_id', CLIENT_ID);
    // RP-Initiated Logout is a front-channel hop like any other, and it was the fifth unrecorded one.
    navigateTo(
      `${LOGOUT_ENDPOINT}?${params.toString()}`,
      'logout — front channel, browser leaves for the RP-initiated logout endpoint',
    );
  };

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">RP-Initiated Logout</h1>
        <span className="tx-ref">OpenID Connect RP-Initiated Logout 1.0</span>
      </header>

      <p className="tx-standfirst">
        A single front-channel hop, and nothing signed out until the server&apos;s own confirmation
        page. Tokens held in this session are cleared here, before the browser leaves.
      </p>

      <div className="tx-body">
        {doc && (
          <OperationDescription
            doc={doc}
            className="tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0"
          />
        )}

        {/* ── Turn 1 ─────────────────────────────────────────────────────── */}
        <div className="tx-turn" data-dir="out">
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">1 · Client → Server</span>
            <span className="tx-turn-note">front channel</span>
          </div>

          <label className="tx-field" htmlFor={`${uid}-hint`}>
            <span className="tx-label">ID Token Hint</span>
            <input
              id={`${uid}-hint`}
              className="tx-input"
              value={idTokenHint}
              onChange={(e) => setIdTokenHint(e.target.value)}
              placeholder="ID token identifying the session to end"
            />
          </label>
          <label className="tx-field" htmlFor={`${uid}-redirect`}>
            <span className="tx-label">Post-Logout Redirect URI</span>
            <input
              id={`${uid}-redirect`}
              className="tx-input"
              value={postLogoutUri}
              onChange={(e) => setPostLogoutUri(e.target.value)}
              placeholder="Must exactly match a URI registered for this client"
            />
          </label>
          <label className="tx-field" htmlFor={`${uid}-state`}>
            <span className="tx-label">State</span>
            <input
              id={`${uid}-state`}
              className="tx-input"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="CSRF protection value"
            />
          </label>

          <div className="tx-actions">
            <button type="button" className="tx-btn tx-btn-primary" onClick={startLogout}>
              RP-Initiated Logout
            </button>
          </div>

          <p className="tx-hint">
            This navigates away from the app and lands on the server&apos;s confirmation page —
            RP-Initiated Logout 1.0 §2 requires the OP to ask before ending the session.{' '}
            <strong>Nothing is signed out until you confirm there.</strong> Tokens are cleared here
            immediately.
          </p>
          <p className="tx-hint">
            You are only redirected back if the URI above exactly matches one registered for this
            client (§3). The client comes from the Client ID, or from the ID token hint&apos;s{' '}
            <code>aud</code> when no Client ID is set — with neither, logout still succeeds but ends
            on the server&apos;s signed-out page.
          </p>
        </div>

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        <div className="tx-turn">
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">2 · Browser → Server</span>
            <span className="tx-turn-note">front channel</span>
          </div>
          <div className="tx-waiting">
            You leave the application here. There is no response to read — the next screen is the
            server&apos;s own confirmation page.
          </div>
        </div>
      </div>
    </section>
  );
}

export { LogoutSection };
