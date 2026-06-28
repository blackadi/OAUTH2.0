import { useState } from 'react';
import { toast } from 'sonner';
import { useToken } from '@/context/TokenContext';
import { tokenService } from '@/services';
import { CLIENT_ID } from '@/config';
import { useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

type TokenOp = 'userinfo' | 'introspect' | 'introspect-std' | 'revoke';

const OPS: { key: TokenOp; label: string }[] = [
  { key: 'userinfo', label: 'UserInfo' },
  { key: 'introspect', label: 'Introspect (Authlete)' },
  { key: 'introspect-std', label: 'Introspect (RFC 7662)' },
  { key: 'revoke', label: 'Revoke Token' },
];

function TokenOpsSection() {
  const { tokenSet } = useToken();
  const at = tokenSet?.access_token;
  const { loading, result, error, call } = useDiscriminatedAsyncCall();
  const [activeOp, setActiveOp] = useState<TokenOp | null>(null);

  const [revClientId, setRevClientId] = useState(
    sessionStorage.getItem('active_client_id') || CLIENT_ID,
  );
  const [revClientSecret, setRevClientSecret] = useState(
    sessionStorage.getItem('active_client_secret') || '',
  );

  const doc = activeOp ? getDoc('token-ops', activeOp) : undefined;

  const handleCall = async (label: TokenOp, fn: () => Promise<unknown>) => {
    setActiveOp(label);
    const { data, error: err } = await call(label, fn);
    if (data) {
      toast.success(`${label} completed`);
    } else {
      toast.error(err);
    }
  };

  return (
    <SectionPanel title="Token Operations" description="Inspect, introspect, and manage tokens">
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {OPS.map((op) => (
          <Button
            key={op.key}
            variant={activeOp === op.key ? 'default' : 'outline'}
            size="sm"
            disabled={!at || loading !== null}
            loading={loading === op.key}
            onClick={() => {
              handleCall(op.key, () => {
                switch (op.key) {
                  case 'userinfo':
                    return tokenService.userInfo(at!);
                  case 'introspect':
                    return tokenService.introspection(at!, at!);
                  case 'introspect-std':
                    return tokenService.introspectionStandard(at!);
                  case 'revoke':
                    return tokenService.revocation(at!, revClientId || undefined, revClientSecret || undefined, 'access_token');
                }
              });
            }}
          >
            {op.label}
          </Button>
        ))}
      </div>

      {activeOp && doc && <OperationDescription doc={doc} />}

      {activeOp === 'revoke' && (
        <div className="space-y-3">
          <Input label="Revocation Client ID" value={revClientId} onChange={(e) => setRevClientId(e.target.value)} placeholder="The client the token belongs to" />
          <Input label="Revocation Client Secret" type="password" value={revClientSecret} onChange={(e) => setRevClientSecret(e.target.value)} placeholder="Client secret for revocation auth" />
        </div>
      )}

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { TokenOpsSection };
