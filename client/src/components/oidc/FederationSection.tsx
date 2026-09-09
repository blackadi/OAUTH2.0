import { useState, useId } from 'react';
import { toast } from 'sonner';
import { federationService } from '@/services';
import { useUrlState } from '@/hooks/useUrlState';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar, tabPanelProps } from '@/components/ui/TabBar';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';
import { useCredentials } from '@/context/CredentialContext';
import '@/styles/transcript.css';

type FederationOp = 'configuration' | 'registration';

/** Every value `FederationOp` can take, as a runtime list — the allowed set for the URL parameter. */
const ALL_OPS = ['configuration', 'registration'] as const satisfies readonly FederationOp[];

const FEDERATION_OPS: { value: FederationOp; label: string }[] = [
  { value: 'configuration', label: 'Configuration' },
  { value: 'registration', label: 'Registration' },
];

/**
 * OpenID Federation, rendered as the exchange it is — the same conversion `ParSection` and its
 * siblings had.
 *
 * **Behaviour is unchanged.** `handleCall` and every service call are the incumbent implementation;
 * only the markup around them changed.
 */
/** Ties this section's tabs to the region they reveal — see `tabPanelProps`. */
const FEDERATION_PANEL_ID = 'federation-panel';

function FederationSection() {
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
  const [activeOp, setActiveOp] = useUrlState<FederationOp>('op', ALL_OPS);
  const { loading, result, error, call } = useAsyncCall();

  const [entityConfiguration, setEntityConfiguration] = useState('');
  const [trustChain, setTrustChain] = useState('');

  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';
  const doc = activeOp ? getDoc('federation', activeOp) : undefined;
  const uid = useId();

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) {
      toast.success(`${activeOp} completed`);
    } else {
      toast.error(err);
    }
  };

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">OpenID Federation</h1>
        <span className="tx-ref">OpenID Federation 1.0 / 1.1</span>
      </header>

      <p className="tx-standfirst">
        Entities prove who they are and how they are trusted by chaining signed statements up to a
        common trust anchor, instead of registering out of band with every party they talk to.
      </p>

      <TabBar
        options={FEDERATION_OPS}
        value={activeOp}
        onChange={setActiveOp}
        panelId={FEDERATION_PANEL_ID}
      />

      <div className="tx-body" {...tabPanelProps(FEDERATION_PANEL_ID, activeOp)}>
        {error && <ErrorExplainer error={error} className="mb-3" />}
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
              <span className="tx-turn-note">
                {activeOp === 'configuration'
                  ? 'GET /api/federation/configuration — public'
                  : 'POST /api/federation/registration'}
              </span>
            </div>

            {activeOp === 'configuration' && (
              <>
                <div className="rounded-lg border border-edge-warning bg-tint-warning p-3 text-sm text-warning-text">
                  <p className="font-medium">This deployment cannot answer this call yet.</p>
                  <p className="mt-1 text-xs">
                    A signed entity configuration needs a federation JWK Set, and this service has
                    none configured. Expect <code>500</code> with{' '}
                    <code>[A316201] federation JWK Set is not configured</code> rather than a
                    document — that is a missing configuration step, not a bug in this tool. On a
                    deployment that has one, this returns a raw JWT (
                    <code>application/entity-statement+jwt</code>), which is why the response below
                    is not wrapped in the usual JSON block.
                  </p>
                </div>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() => handleCall(() => federationService.getConfiguration())}
                    disabled={loading}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Fetch Configuration
                  </button>
                </div>
              </>
            )}

            {activeOp === 'registration' && (
              <>
                <AdminAuth label="Admin" />
                <label className="tx-field" htmlFor={`${uid}-entity`}>
                  <span className="tx-label">Entity Configuration (JWT)</span>
                  <textarea
                    id={`${uid}-entity`}
                    className="tx-textarea"
                    rows={6}
                    value={entityConfiguration}
                    onChange={(e) => setEntityConfiguration(e.target.value)}
                    placeholder="Paste the entity configuration JWT of the RP to register"
                  />
                </label>
                <p className="tx-hint">— or —</p>
                <label className="tx-field" htmlFor={`${uid}-chain`}>
                  <span className="tx-label">Trust Chain (JSON)</span>
                  <textarea
                    id={`${uid}-chain`}
                    className="tx-textarea"
                    rows={6}
                    value={trustChain}
                    onChange={(e) => setTrustChain(e.target.value)}
                    placeholder='["jwt1","jwt2",...]'
                  />
                </label>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="tx-btn tx-btn-primary"
                    onClick={() =>
                      handleCall(() =>
                        federationService.register(
                          entityConfiguration ? { entityConfiguration } : { trustChain },
                          auth,
                        ),
                      )
                    }
                    disabled={loading || (!entityConfiguration && !trustChain)}
                  >
                    {loading && <span className="tx-spin" aria-hidden="true" />}
                    Register
                  </button>
                </div>
              </>
            )}
          </div>
        )}

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
              <div className="tx-waiting">Nothing sent yet.</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export { FederationSection };
