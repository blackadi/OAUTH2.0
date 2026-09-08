import { useState, useId } from 'react';
import { toast } from 'sonner';
import { backchannelLogoutService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { useCredentials } from '@/context/CredentialContext';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { decodeJwt } from '@/utils/jwt';
import '@/styles/transcript.css';

/**
 * The logout token's payload, or a message to render in its place.
 *
 * Delegates to the shared `decodeJwt` rather than decoding here. The local copy omitted base64
 * padding and never checked that the segment decoded to an object, so it was the same helper minus
 * two correctness properties — and `utils/jwt.ts` is where this app's JWT decoding lives.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | string {
  try {
    return decodeJwt(token).payload;
  } catch (e) {
    return `Failed to decode: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Back-Channel Logout, rendered as the exchange it is — the same conversion `ParSection` and its
 * siblings had. One request shape, three ways to fire it, and a response that comes back in three
 * different observable forms depending on which one ran.
 *
 * **Behaviour is unchanged.** `handleCall` and every service call are the incumbent implementation;
 * only the markup around them changed.
 */
function BackchannelLogoutSection() {
  const [clientIdentifier, setClientIdentifier] = useState('');
  const [subject, setSubject] = useState('');
  const [sessionId, setSessionId] = useState('');
  // Was a third hand-rolled copy of the same credential, with its own btoa. Both come from the
  // shared profile now, including the encoding.
  const { basicAuth: mgmtAuth } = useCredentials();
  const { loading, result, error, call } = useAsyncCall();
  /**
   * Which operation was last run, so its documentation can be shown.
   *
   * The `backchannel-logout` registry entries were written and then never rendered — three good
   * paragraphs with no `getDoc` call anywhere in the app. Tracking the operation is all that was
   * missing.
   */
  const [activeOp, setActiveOp] = useState<'issue' | 'deliver' | 'deliver-all' | null>(null);
  const doc = activeOp ? getDoc('backchannel-logout', activeOp) : undefined;
  const uid = useId();

  const handleCall = async (
    op: 'issue' | 'deliver' | 'deliver-all',
    fn: () => Promise<unknown>,
  ) => {
    setActiveOp(op);
    const { data, error: err } = await call(fn);
    if (data) {
      toast.success('Operation completed');
    } else {
      toast.error(err);
    }
  };

  const decodedLogoutToken =
    result && typeof result === 'object' && 'logoutToken' in result
      ? decodeJwtPayload((result as { logoutToken: string }).logoutToken)
      : null;
  const hasTokenResult = !!(result && typeof result === 'object' && 'logoutToken' in result);
  const isArrayResult = Array.isArray(result);

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">Back-Channel Logout</h1>
        <span className="tx-ref">OpenID Connect Back-Channel Logout 1.0</span>
      </header>

      <p className="tx-standfirst">
        The OP tells a client&apos;s back channel directly that a session ended, with no browser
        involved — a signed logout token instead of a redirect. One request shape, three ways to
        send it: mint the token alone, mint and deliver it to one client, or deliver to every client
        the subject or session touches.
      </p>

      <div className="tx-body">
        {error && <ErrorExplainer error={error} className="mb-3" />}
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
          </div>

          <AdminAuth />
          <label className="tx-field" htmlFor={`${uid}-cid`}>
            <span className="tx-label">Client Identifier</span>
            <input
              id={`${uid}-cid`}
              className="tx-input"
              value={clientIdentifier}
              onChange={(e) => setClientIdentifier(e.target.value)}
              placeholder="client_id or client_id_alias (required for issue/deliver)"
            />
          </label>
          <label className="tx-field" htmlFor={`${uid}-subject`}>
            <span className="tx-label">Subject</span>
            <input
              id={`${uid}-subject`}
              className="tx-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="End-user subject"
            />
          </label>
          <label className="tx-field" htmlFor={`${uid}-session`}>
            <span className="tx-label">Session ID</span>
            <input
              id={`${uid}-session`}
              className="tx-input"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Session identifier — alternative to subject"
            />
          </label>

          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              disabled={!mgmtAuth || !clientIdentifier || loading}
              onClick={() =>
                handleCall('issue', () =>
                  backchannelLogoutService.issue(
                    { clientIdentifier, subject, sessionId },
                    mgmtAuth,
                  ),
                )
              }
            >
              {loading && activeOp === 'issue' && <span className="tx-spin" aria-hidden="true" />}
              Issue Token
            </button>
            <button
              type="button"
              className="tx-btn"
              disabled={!mgmtAuth || !clientIdentifier || loading}
              onClick={() =>
                handleCall('deliver', () =>
                  backchannelLogoutService.deliver(
                    { clientIdentifier, subject, sessionId },
                    mgmtAuth,
                  ),
                )
              }
            >
              {loading && activeOp === 'deliver' && <span className="tx-spin" aria-hidden="true" />}
              Issue &amp; Deliver
            </button>
            <button
              type="button"
              className="tx-btn"
              disabled={!mgmtAuth || (!subject && !sessionId) || loading}
              onClick={() =>
                handleCall('deliver-all', () =>
                  backchannelLogoutService.deliverAll({ subject, sessionId }, mgmtAuth),
                )
              }
            >
              {loading && activeOp === 'deliver-all' && (
                <span className="tx-spin" aria-hidden="true" />
              )}
              Issue &amp; Deliver All
            </button>
          </div>
        </div>

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        <div
          className="tx-turn"
          data-dir={result ? 'in' : undefined}
          data-state={result ? 'landed' : 'pending'}
        >
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">2 · Server → Client</span>
          </div>

          {hasTokenResult ? (
            <div className="space-y-3">
              <details className="tx-evidence" open>
                <summary style={{ cursor: 'pointer' }}>
                  <span className="tx-evidence-verdict">Raw Response</span>
                </summary>
                <JsonBlock data={result} className="m-0" />
              </details>
              <details className="tx-evidence" open>
                <summary style={{ cursor: 'pointer' }}>
                  <span className="tx-evidence-verdict">Decoded Logout Token (JWT Payload)</span>
                </summary>
                {typeof decodedLogoutToken === 'string' ? (
                  <p className="tx-hint">{decodedLogoutToken}</p>
                ) : (
                  <JsonBlock data={decodedLogoutToken} className="m-0" />
                )}
                <p className="tx-hint">
                  The logout token is a JWT with <code>typ: &quot;logout+jwt&quot;</code> and an{' '}
                  <code>events</code> claim containing{' '}
                  <code>http://schemas.openid.net/event/backchannel-logout</code>.
                </p>
              </details>
            </div>
          ) : isArrayResult ? (
            <details className="tx-evidence" open>
              <summary style={{ cursor: 'pointer' }}>
                <span className="tx-evidence-verdict">
                  Deliver-All Results ({(result as unknown[]).length} clients processed)
                </span>
              </summary>
              <JsonBlock data={result} className="m-0" />
            </details>
          ) : result ? (
            <JsonBlock data={result} label="Response" />
          ) : (
            <div className="tx-waiting">Nothing sent yet.</div>
          )}
        </div>
      </div>
    </section>
  );
}

export { BackchannelLogoutSection };
