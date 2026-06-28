import { useState } from 'react';
import { toast } from 'sonner';
import { tokenService } from '@/services';
import { useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

type DiscOp = 'discovery' | 'jwks';

function DiscoverySection() {
  const { loading, result, error, call } = useDiscriminatedAsyncCall<DiscOp>();
  const [activeOp, setActiveOp] = useState<DiscOp | null>(null);

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
      {error && <p className="text-xs text-red-400">{error}</p>}

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

      {result ? <JsonBlock data={result} label={activeOp === 'jwks' ? 'JWKS' : 'Discovery Document'} /> : null}
    </SectionPanel>
  );
}

export { DiscoverySection };
