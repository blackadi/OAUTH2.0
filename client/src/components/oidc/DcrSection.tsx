import { useState, useId } from 'react';
import { toast } from 'sonner';
import { dcrService } from '@/services';
import { useUrlState } from '@/hooks/useUrlState';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar, tabPanelProps } from '@/components/ui/TabBar';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';
import { useTraces } from '@/hooks/useTraces';
import { sequenceProgress, type SequenceStepSpec } from '@/utils/sequence-progress';
import { useConfirmedAction } from '@/hooks/useConfirmedAction';
import { useCredentials } from '@/context/CredentialContext';
import '@/styles/transcript.css';

type DcrOp = 'register' | 'get' | 'update' | 'delete';

/** Every value `DcrOp` can take, as a runtime list — the allowed set for the URL parameter. */
const ALL_OPS = ['register', 'get', 'update', 'delete'] as const satisfies readonly DcrOp[];

const DEFAULT_METADATA = JSON.stringify(
  {
    client_name: 'My DCR Client',
    redirect_uris: ['http://localhost:3001/callback'],
    grant_types: ['AUTHORIZATION_CODE', 'REFRESH_TOKEN'],
    token_endpoint_auth_method: 'CLIENT_SECRET_BASIC',
  },
  null,
  2,
);

const DCR_OPS: { value: DcrOp; label: string }[] = [
  { value: 'register', label: 'Register' },
  { value: 'get', label: 'Get' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
];

const OP_ENDPOINT: Record<DcrOp, string> = {
  register: '/api/client/dcr/register',
  get: '/api/client/dcr/get',
  update: '/api/client/dcr/update',
  delete: '/api/client/dcr/delete',
};

/**
 * DCR, rendered as the exchange it is — the same conversion `ParSection` and its siblings had.
 * `register` is not one option of four — it is the one that makes the other three possible, which is
 * what `FlowDiagram` above the tabs states and each turn below re-states for whichever step is active.
 *
 * **Behaviour is unchanged.** `handleCall` and every service call are the incumbent implementation;
 * only the markup around them changed.
 */
const DCR_STEPS: SequenceStepSpec[] = [
  {
    id: 'register',
    label: 'Register',
    description: 'RFC 7591 §3: creates the client and mints its registration access token.',
    endpoint: '/api/client/dcr/register',
  },
  {
    id: 'get',
    label: 'Read',
    description: 'RFC 7592 §2.1: read it back with that token.',
    endpoint: '/api/client/dcr/get',
  },
  {
    id: 'update',
    label: 'Update',
    description: 'RFC 7592 §2.2: the metadata document must carry client_id.',
    endpoint: '/api/client/dcr/update',
  },
  {
    id: 'delete',
    label: 'Deregister',
    description: 'RFC 7592 §2.3: permanent, and the token dies with the client.',
    endpoint: '/api/client/dcr/delete',
  },
];

/** Ties this section's tabs to the region they reveal — see `tabPanelProps`. */
const DCR_PANEL_ID = 'dcr-panel';

function DcrSection() {
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
  const [activeOp, setActiveOp] = useUrlState<DcrOp>('op', ALL_OPS);
  const { loading, result, error, call } = useAsyncCall();

  const [regJson, setRegJson] = useState(DEFAULT_METADATA);
  const [getClientId, setGetClientId] = useState('');
  const [getToken, setGetToken] = useState('');
  const [updateClientId, setUpdateClientId] = useState('');
  const [updateToken, setUpdateToken] = useState('');
  const [updateJson, setUpdateJson] = useState('');
  const [deleteClientId, setDeleteClientId] = useState('');
  const [deleteToken, setDeleteToken] = useState('');

  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';
  const doc = activeOp ? getDoc('dcr', activeOp) : undefined;
  const traces = useTraces();
  const progress = sequenceProgress(DCR_STEPS, traces);
  const { confirm, dialog } = useConfirmedAction();
  const uid = useId();

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) {
      if (activeOp === 'register') {
        // T1-11: the server now returns RFC 7591 §3.2.1's registration response as the body, so there is no
        // vendor envelope to unwrap. The `responseContent` branch this replaced existed only because the body
        // used to be Authlete's envelope with the real response nested inside it — and the camelCase
        // fallbacks existed because it was ambiguous which you would get.
        const parsed = data as Record<string, unknown>;
        const clientId = (parsed.client_id || '') as string;
        const regAccessToken = (parsed.registration_access_token || '') as string;
        if (clientId) {
          setGetClientId(clientId);
          setUpdateClientId(clientId);
          setDeleteClientId(clientId);
        }
        if (regAccessToken) {
          setGetToken(regAccessToken);
          setUpdateToken(regAccessToken);
          setDeleteToken(regAccessToken);
        }
      }
      toast.success(`${activeOp} completed`);
    } else {
      toast.error(err);
    }
  };

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">Dynamic Client Registration</h1>
        <span className="tx-ref">RFC 7591 / RFC 7592</span>
      </header>

      <p className="tx-standfirst">
        A client registers itself and gets back a registration access token — the credential the
        other three operations need. Pick a step below to see what it sends and what comes back.
      </p>

      <AdminAuth label="Admin" />

      {error && <ErrorExplainer error={error} className="mb-3" />}

      <FlowDiagram
        steps={DCR_STEPS}
        currentStep={progress.currentStep}
        completedSteps={progress.completedSteps}
        className="mb-3"
      />

      <TabBar options={DCR_OPS} value={activeOp} onChange={setActiveOp} panelId={DCR_PANEL_ID} />

      <div className="tx-body" {...tabPanelProps(DCR_PANEL_ID, activeOp)}>
        {activeOp && doc && (
          <OperationDescription
            doc={doc}
            className="tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0"
          />
        )}

        {/* ── Turn 1 ─────────────────────────────────────────────────────── */}
        {activeOp && (
          <div className="tx-turn" data-dir="out">
            <span className="tx-marker" aria-hidden="true" />
            <div className="tx-turn-head">
              <span className="tx-turn-label">1 · Client → Server</span>
              <span className="tx-turn-note">POST {OP_ENDPOINT[activeOp]}</span>
            </div>

            {activeOp === 'register' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-reg`}>
                  <span className="tx-label">Client Metadata (JSON)</span>
                  <textarea
                    id={`${uid}-reg`}
                    className="tx-textarea"
                    rows={10}
                    value={regJson}
                    onChange={(e) => setRegJson(e.target.value)}
                    placeholder='{"client_name":"My App","redirect_uris":["http://localhost:3001/callback"],"grant_types":["AUTHORIZATION_CODE"]}'
                  />
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() =>
                      handleCall(() => dcrService.dcrRegister({ json: regJson }, auth))
                    }
                    disabled={loading}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Run
                  </button>
                </div>
              </>
            )}

            {activeOp === 'get' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-get-cid`}>
                  <span className="tx-label">Client ID</span>
                  <input
                    id={`${uid}-get-cid`}
                    className="tx-input"
                    value={getClientId}
                    onChange={(e) => setGetClientId(e.target.value)}
                    placeholder="client_id from registration"
                  />
                </label>
                <label className="tx-field" htmlFor={`${uid}-get-token`}>
                  <span className="tx-label">Registration Access Token</span>
                  <input
                    id={`${uid}-get-token`}
                    className="tx-input"
                    value={getToken}
                    onChange={(e) => setGetToken(e.target.value)}
                    placeholder="registration_access_token from registration"
                  />
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() => handleCall(() => dcrService.dcrGet(getToken, getClientId))}
                    disabled={loading}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Run
                  </button>
                </div>
              </>
            )}

            {activeOp === 'update' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-upd-cid`}>
                  <span className="tx-label">Client ID</span>
                  <input
                    id={`${uid}-upd-cid`}
                    className="tx-input"
                    value={updateClientId}
                    onChange={(e) => setUpdateClientId(e.target.value)}
                    placeholder="client_id from registration"
                  />
                </label>
                <label className="tx-field" htmlFor={`${uid}-upd-token`}>
                  <span className="tx-label">Registration Access Token</span>
                  <input
                    id={`${uid}-upd-token`}
                    className="tx-input"
                    value={updateToken}
                    onChange={(e) => setUpdateToken(e.target.value)}
                    placeholder="registration_access_token from registration"
                  />
                </label>
                <label className="tx-field" htmlFor={`${uid}-upd-json`}>
                  <span className="tx-label">Updated Client Metadata (JSON)</span>
                  <textarea
                    id={`${uid}-upd-json`}
                    className="tx-textarea"
                    rows={10}
                    value={updateJson}
                    onChange={(e) => setUpdateJson(e.target.value)}
                    placeholder='{"client_name":"Updated Name","redirect_uris":["http://localhost:3001/callback"]}'
                  />
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() =>
                      handleCall(() =>
                        dcrService.dcrUpdate(updateJson, updateToken, updateClientId),
                      )
                    }
                    disabled={loading}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Run
                  </button>
                </div>
              </>
            )}

            {activeOp === 'delete' && (
              <>
                <label className="tx-field" htmlFor={`${uid}-del-cid`}>
                  <span className="tx-label">Client ID</span>
                  <input
                    id={`${uid}-del-cid`}
                    className="tx-input"
                    value={deleteClientId}
                    onChange={(e) => setDeleteClientId(e.target.value)}
                    placeholder="client_id from registration"
                  />
                </label>
                <label className="tx-field" htmlFor={`${uid}-del-token`}>
                  <span className="tx-label">Registration Access Token</span>
                  <input
                    id={`${uid}-del-token`}
                    className="tx-input"
                    value={deleteToken}
                    onChange={(e) => setDeleteToken(e.target.value)}
                    placeholder="registration_access_token from registration"
                  />
                </label>
                {/* RFC 7592 §2.3 deregistration is permanent at the authorization server. Same reasoning
                    as Client Management: the identifier has to be typed back before the button will
                    fire. */}
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn"
                    disabled={!deleteClientId.trim() || !deleteToken.trim() || loading}
                    onClick={() =>
                      confirm({
                        title: 'Deregister this client permanently?',
                        body: `Client ${deleteClientId} will be deleted at the authorization server (RFC 7592 §2.3). Its registration access token dies with it, so this cannot be undone from here.`,
                        confirmLabel: 'Deregister client',
                        requireTyped: deleteClientId.trim(),
                        run: () =>
                          handleCall(() => dcrService.dcrDelete(deleteToken, deleteClientId)),
                      })
                    }
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {dialog}

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        {activeOp && (
          <div
            className="tx-turn"
            data-dir={result ? 'in' : undefined}
            data-state={result ? 'landed' : 'pending'}
          >
            <span className="tx-marker" aria-hidden="true" />
            <div className="tx-turn-head">
              <span className="tx-turn-label">2 · Server → Client</span>
            </div>
            {result ? (
              <JsonBlock data={result} label="Response" />
            ) : (
              <div className="tx-waiting">Nothing sent yet for this step.</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export { DcrSection };
