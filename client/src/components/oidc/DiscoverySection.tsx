import { toast } from 'sonner';
import { tokenService } from '@/services';
import { useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { useUrlState } from '@/hooks/useUrlState';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import '@/styles/transcript.css';

type DiscOp = 'discovery' | 'jwks';

/** Every value `DiscOp` can take, as a runtime list — the allowed set for the URL parameter. */
const ALL_OPS = ['discovery', 'jwks'] as const satisfies readonly DiscOp[];

/**
 * Discovery, rendered as the exchange it is — the same conversion `ParSection` and its siblings had.
 * Two bare `GET`s with no request body, which is the point worth stating rather than hiding behind a
 * form: RFC 8414 metadata and the JWKS are both public, and turn 1 has nothing to fill in because
 * there is nothing to authenticate.
 *
 * **Behaviour is unchanged.** `handleCall` and the discriminated `loading` label are the incumbent
 * implementation; only the markup changed.
 */
function DiscoverySection() {
  const { loading, result, error, call } = useDiscriminatedAsyncCall<DiscOp>();
  /**
   * The selected operation lives in the URL, so a specific step can be shared and Back undoes it.
   *
   * Was `useState`, which made a tab invisible to the address bar: *"look at what happened on the
   * introspection step"* could not be communicated, Back left the section rather than undoing the tab,
   * and a reload lost your place mid-protocol. `useUrlState` validates the incoming value against
   * `ALL_OPS`, so a hand-edited query cannot select a tab that does not exist.
   */
  const [activeOp, setActiveOp] = useUrlState<DiscOp>('op', ALL_OPS);

  const doc = activeOp ? getDoc('discovery', activeOp) : undefined;

  const handleCall = async (label: DiscOp, fn: () => Promise<unknown>) => {
    setActiveOp(label);
    const { data, error: err } = await call(label, fn);
    if (data) {
      toast.success(`${label} fetched`);
    } else {
      toast.error(err);
    }
  };

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">Discovery</h1>
        <span className="tx-ref">RFC 8414</span>
      </header>

      <p className="tx-standfirst">
        Two public documents an OpenID Connect client bootstraps from — the provider&apos;s metadata
        and its signing keys. Neither takes a credential; that is the property worth seeing, not
        just stating.
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
            <span className="tx-turn-note">public — no credential either endpoint needs</span>
          </div>

          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              disabled={loading !== null}
              onClick={() => handleCall('discovery', () => tokenService.discovery())}
            >
              {loading === 'discovery' && <span className="tx-spin" aria-hidden="true" />}
              Fetch OpenID Configuration
            </button>
            <button
              type="button"
              className="tx-btn"
              disabled={loading !== null}
              onClick={() => handleCall('jwks', () => tokenService.getJwks())}
            >
              {loading === 'jwks' && <span className="tx-spin" aria-hidden="true" />}
              Fetch JWKS
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

          {result ? (
            <JsonBlock data={result} label={activeOp === 'jwks' ? 'JWKS' : 'Discovery Document'} />
          ) : (
            <div className="tx-waiting">
              Fetch either document above to see it here — labelled by which one actually came back,
              never assumed from which button you pressed.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export { DiscoverySection };
