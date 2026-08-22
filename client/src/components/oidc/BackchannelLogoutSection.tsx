import { useState } from 'react';
import { toast } from 'sonner';
import { backchannelLogoutService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { useCredentials } from '@/context/CredentialContext';
import { AdminAuth } from '@/components/layout/AdminAuth';

function decodeJwtPayload(token: string): Record<string, unknown> | string {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return 'Invalid JWT: expected 3 parts';
    const payload = parts[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json;
  } catch (e) {
    return `Failed to decode: ${e instanceof Error ? e.message : String(e)}`;
  }
}

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


  const handleCall = async (op: 'issue' | 'deliver' | 'deliver-all', fn: () => Promise<unknown>) => {
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
    <SectionPanel title="Backchannel Logout" description="OpenID Connect Back-Channel Logout 1.0">
      <div className="space-y-3">
        <AdminAuth />
        <Input label="Client Identifier" value={clientIdentifier} onChange={(e) => setClientIdentifier(e.target.value)} placeholder="client_id or client_id_alias (required for issue/deliver)" />
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="End-user subject" />
        <Input label="Session ID" value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Session identifier — alternative to subject" />
      </div>

      {doc && <OperationDescription doc={doc} className="mb-3" />}

      {error && <ErrorExplainer error={error} className="mb-3" />}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!mgmtAuth || !clientIdentifier || loading} loading={loading} onClick={() => handleCall('issue', () => backchannelLogoutService.issue({ clientIdentifier, subject, sessionId }, mgmtAuth))}>
          Issue Token
        </Button>
        <Button size="sm" variant="secondary" disabled={!mgmtAuth || !clientIdentifier || loading} loading={loading} onClick={() => handleCall('deliver', () => backchannelLogoutService.deliver({ clientIdentifier, subject, sessionId }, mgmtAuth))}>
          Issue & Deliver
        </Button>
        <Button size="sm" variant="secondary" disabled={!mgmtAuth || (!subject && !sessionId) || loading} loading={loading} onClick={() => handleCall('deliver-all', () => backchannelLogoutService.deliverAll({ subject, sessionId }, mgmtAuth))}>
          Issue & Deliver All
        </Button>
      </div>

      {result && !hasTokenResult && !isArrayResult ? <JsonBlock data={result} label="Response" /> : null}

      {hasTokenResult && (
        <div className="space-y-3">
          <details className="rounded-lg border border-border overflow-hidden" open>
            <summary className="px-3 py-2 text-xs font-semibold cursor-pointer bg-muted/20 select-none">Raw Response</summary>
            <JsonBlock data={result} className="m-0" />
          </details>
          <details className="rounded-lg border border-border overflow-hidden" open>
            <summary className="px-3 py-2 text-xs font-semibold cursor-pointer bg-muted/20 select-none">Decoded Logout Token (JWT Payload)</summary>
            {typeof decodedLogoutToken === 'string' ? (
              <p className="text-xs text-red-400 p-3">{decodedLogoutToken}</p>
            ) : (
              <JsonBlock data={decodedLogoutToken} className="m-0" />
            )}
            <p className="text-xs text-muted-foreground px-3 pb-2">
              The logout token is a JWT with <code className="text-indigo-300">typ: &quot;logout+jwt&quot;</code> and an{' '}
              <code className="text-indigo-300">events</code> claim containing{' '}
              <code className="text-indigo-300">http://schemas.openid.net/event/backchannel-logout</code>.
            </p>
          </details>
        </div>
      )}

      {isArrayResult && (
        <div className="space-y-3">
          <details className="rounded-lg border border-border overflow-hidden" open>
            <summary className="px-3 py-2 text-xs font-semibold cursor-pointer bg-muted/20 select-none">
              Deliver-All Results ({(result as unknown[]).length} clients processed)
            </summary>
            <JsonBlock data={result} className="m-0" />
          </details>
        </div>
      )}
    </SectionPanel>
  );
}

export { BackchannelLogoutSection };
