import { useState } from 'react';
import { toast } from 'sonner';
import { federationService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';

type FederationOp = 'configuration' | 'registration';

const FEDERATION_OPS: { value: FederationOp; label: string }[] = [
  { value: 'configuration', label: 'Configuration' },
  { value: 'registration', label: 'Registration' },
];

function FederationSection() {
  const [authId, setAuthId] = useState('');
  const [authSecret, setAuthSecret] = useState('');
  const [activeOp, setActiveOp] = useState<FederationOp | null>(null);
  const { loading, result, error, call } = useAsyncCall();

  const [entityConfiguration, setEntityConfiguration] = useState('');
  const [trustChain, setTrustChain] = useState('');

  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';
  const doc = activeOp ? getDoc('federation', activeOp) : undefined;

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) {
      toast.success(`${activeOp} completed`);
    } else {
      toast.error(err);
    }
  };

  return (
    <SectionPanel title="OpenID Federation 1.0" description="Entity configuration and registration endpoints for OIDC Federation">
      {error && <p className="text-xs text-red-400">{error}</p>}

      <TabBar options={FEDERATION_OPS} value={activeOp} onChange={setActiveOp} />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {activeOp === 'configuration' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Fetch the entity configuration JWT for this authorization server. This endpoint is public (no auth required).
          </p>
          <Button onClick={() => handleCall(() => federationService.getConfiguration())} loading={loading}>Fetch Configuration</Button>
        </div>
      )}

      {activeOp === 'registration' && (
        <div className="space-y-3">
          <AdminAuth clientId={authId} clientSecret={authSecret} onClientIdChange={setAuthId} onClientSecretChange={setAuthSecret} label="Admin" />
          <Textarea
            label="Entity Configuration (JWT)"
            rows={6}
            value={entityConfiguration}
            onChange={(e) => setEntityConfiguration(e.target.value)}
            placeholder="Paste the entity configuration JWT of the RP to register"
          />
          <p className="text-xs text-slate-500">— or —</p>
          <Textarea
            label="Trust Chain (JSON)"
            rows={6}
            value={trustChain}
            onChange={(e) => setTrustChain(e.target.value)}
            placeholder='["jwt1","jwt2",...]'
          />
          <Button
            onClick={() =>
              handleCall(() =>
                federationService.register(
                  entityConfiguration
                    ? { entityConfiguration }
                    : { trustChain },
                  auth,
                ),
              )
            }
            loading={loading}
            disabled={!entityConfiguration && !trustChain}
          >
            Register
          </Button>
        </div>
      )}

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { FederationSection };
