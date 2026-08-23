import { toast } from 'sonner';
import { tokenService } from '@/services';
import { useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { useUrlState } from '@/hooks/useUrlState';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

type DiscOp = 'discovery' | 'jwks';

/** Every value `DiscOp` can take, as a runtime list — the allowed set for the URL parameter. */
const ALL_OPS = ['discovery', 'jwks'] as const satisfies readonly DiscOp[];

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
    <SectionPanel title="Discovery" description="OpenID Connect Discovery and JWKS endpoints">
      {error && <ErrorExplainer error={error} className="mb-3" />}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={activeOp === 'discovery' ? 'default' : 'outline'}
          size="sm"
          disabled={loading !== null}
          loading={loading === 'discovery'}
          onClick={() => handleCall('discovery', () => tokenService.discovery())}
        >
          Fetch OpenID Configuration
        </Button>
        <Button
          variant={activeOp === 'jwks' ? 'default' : 'outline'}
          size="sm"
          disabled={loading !== null}
          loading={loading === 'jwks'}
          onClick={() => handleCall('jwks', () => tokenService.getJwks())}
        >
          Fetch JWKS
        </Button>
      </div>

      {activeOp && doc && <OperationDescription doc={doc} />}

      {result ? (
        <JsonBlock data={result} label={activeOp === 'jwks' ? 'JWKS' : 'Discovery Document'} />
      ) : null}
    </SectionPanel>
  );
}

export { DiscoverySection };
