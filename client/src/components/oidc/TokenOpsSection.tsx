import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useToken } from '@/context/TokenContext';
import { tokenService } from '@/services';
import { CLIENT_ID } from '@/config';
import { useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { AdminAuth } from '@/components/layout/AdminAuth';

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

  // RFC 9470: Step-up auth validation inputs for Authlete introspection
  const [introspectAcrValues, setIntrospectAcrValues] = useState('');
  const [introspectMaxAge, setIntrospectMaxAge] = useState('');

  // RFC 7662 §2.1 requires the introspection endpoint to be protected. Both endpoints take this
  // deployment's admin credentials — see the note in services/token.service.ts.
  const [adminId, setAdminId] = useState('');
  const [adminSecret, setAdminSecret] = useState('');

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
      {error && <ErrorExplainer error={error} className="mb-3" />}

      {!at && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p className="font-medium">No access token available</p>
          <p className="mt-1 text-xs text-amber-300/80">
            Obtain a token first via the Grant Flows section (Authorization Code, Client Credentials, etc.), then return here.
          </p>
          <Link to="/auth-flows">
            <Button variant="outline" size="sm" className="mt-2 border-amber-500/50 text-amber-200 hover:bg-amber-500/20">
              Go to Grant Flows
            </Button>
          </Link>
        </div>
      )}

      {at && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
          Access token loaded: <code className="font-mono">{at.slice(0, 20)}...</code>
        </div>
      )}

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
                  case 'introspect': {
                    const opts: { acrValues?: string; maxAge?: number } = {};
                    if (introspectAcrValues.trim()) opts.acrValues = introspectAcrValues.trim();
                    if (introspectMaxAge.trim()) opts.maxAge = Number(introspectMaxAge.trim());
                    return tokenService.introspection(at!, adminId, adminSecret, Object.keys(opts).length ? opts : undefined);
                  }
                  case 'introspect-std':
                    return tokenService.introspectionStandard(at!, adminId, adminSecret);
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

      {(activeOp === 'introspect' || activeOp === 'introspect-std') && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            RFC 7662 §2.1 requires the introspection endpoint to be protected, so both endpoints take this
            deployment&apos;s admin credentials. Without them the server answers <code>401</code> and never
            reaches Authlete.
          </p>
          <AdminAuth
            clientId={adminId}
            clientSecret={adminSecret}
            onClientIdChange={setAdminId}
            onClientSecretChange={setAdminSecret}
          />
        </div>
      )}

      {activeOp === 'introspect' && (
        <div className="space-y-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
          <p className="text-xs font-medium text-blue-300">RFC 9470 Step-Up Authentication Validation</p>
          <Input
            label="ACR Values (space-separated)"
            value={introspectAcrValues}
            onChange={(e) => setIntrospectAcrValues(e.target.value)}
            placeholder="e.g. pwd urn:mace:incommon:iap:silver"
          />
          <Input
            label="Max Authentication Age (seconds)"
            type="number"
            value={introspectMaxAge}
            onChange={(e) => setIntrospectMaxAge(e.target.value)}
            placeholder="e.g. 3600"
          />
          <p className="text-[0.6rem] text-muted-foreground">
            If the token's ACR doesn't match or auth_time exceeds max_age, Authlete returns <code>insufficient_user_authentication</code> with the required values.
          </p>
        </div>
      )}

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { TokenOpsSection };
