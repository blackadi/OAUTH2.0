import { useState } from 'react';
import { toast } from 'sonner';
import { parService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

function ParSection() {
  const { loading, result, error, call } = useAsyncCall();

  const [parameters, setParameters] = useState(
    'response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000&scope=openid&state=par_state&code_challenge_method=S256&code_challenge=',
  );
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const doc = getDoc('par', 'create');

  const handlePush = async () => {
    const { data, error: err } = await call(() => parService.pushedAuthorization({ parameters, clientId, clientSecret }));
    if (data) {
      toast.success('PAR request completed');
    } else {
      toast.error(err);
    }
  };

  return (
    <SectionPanel title="Pushed Authorization Requests (RFC 9126)" description="Send authorization parameters via POST for a cleaner redirect">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {doc && <OperationDescription doc={doc} />}

      <div className="space-y-3">
        <Textarea label="Parameters (URL-encoded)" rows={4} value={parameters} onChange={(e) => setParameters(e.target.value)} placeholder="response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000&scope=openid&state=...&code_challenge=..." />
        <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="your_client_id" />
        <Input label="Client Secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="your_client_secret" />
        <Button onClick={handlePush} loading={loading}>
          Push Authorization Request
        </Button>
      </div>

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { ParSection };
