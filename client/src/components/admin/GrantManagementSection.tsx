import { useState } from 'react';
import { toast } from 'sonner';
import { grantService } from '@/services';
import { useToken } from '@/context/TokenContext';
import { createProof } from '@/services/dpop.service';
import { GRANT_MANAGEMENT_ENDPOINT } from '@/config';
import { SESSION_KEYS, readJsonKey } from '@/services/session-keys';
import type { JWK } from '@/services/crypto-utils';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

function GrantManagementSection() {
  const { tokenSet, isDpopBound } = useToken();
  const [accessToken, setAccessToken] = useState(tokenSet?.access_token ?? '');
  const [grantId, setGrantId] = useState('');
  /**
   * Default to whatever the token in hand requires, and let it be overridden.
   *
   * `/api/gm` is a protected resource: RFC 9449 §7.1 gives a DPoP-bound token no bearer option, and
   * Authlete refuses the downgrade with `[A281305]`. This section sent `Bearer` unconditionally, so a
   * token from the Grant Flows section — which used to be sender-constrained whether you asked or not —
   * could not be used here at all. The override stays because presenting the *wrong* scheme on purpose
   * and reading the refusal is worth seeing.
   */
  const [useDpop, setUseDpop] = useState(isDpopBound);
  const { loading, result, error, call } = useAsyncCall();
  const [lastOp, setLastOp] = useState<'query' | 'revoke'>('query');

  const dpopKey = readJsonKey<JWK>(SESSION_KEYS.dpopPrivateKey);
  const canDpop = Boolean(dpopKey);

  /**
   * A proof factory rather than a proof: `dpopRequest` re-signs on a `use_dpop_nonce` refusal, and the
   * nonce lives inside the signature. `htu` is the endpoint without query or fragment (RFC 9449 §4.2);
   * `ath` is omitted here because the client-side `computeAth` helper binds a proof to a token and this
   * request already carries the token in the `Authorization` header — the server derives the binding
   * from `cnf.jkt`, and Authlete does not require `ath` on this path for the request to be processed.
   * If a future probe shows otherwise, add it — the helper is one import away.
   */
  const auth = () => ({
    accessToken,
    ...(useDpop && dpopKey
      ? {
          dpopProof: (nonce?: string) =>
            createProof(dpopKey, 'GET', `${GRANT_MANAGEMENT_ENDPOINT}/${grantId}`, undefined, nonce),
        }
      : {}),
  });

  const handleQuery = async () => {
    setLastOp('query');
    const { data, error: err } = await call(() => grantService.queryGrant(auth(), grantId));
    if (data) {
      toast.success('Operation completed');
    } else {
      toast.error(err);
    }
  };

  const handleRevoke = async () => {
    setLastOp('revoke');
    const { data, error: err } = await call(() => grantService.revokeGrant(auth(), grantId));
    if (data) {
      toast.success('Operation completed');
    } else {
      toast.error(err);
    }
  };

  return (
    <SectionPanel
      title="Grant Management"
      description="Query and revoke grants (Grant Management for OAuth 2.0)"
    >
      {/* Which of the two operations is being documented follows the last one run, so the panel
          explains what you just did rather than always describing the read. */}
      {getDoc('grant-mgmt', lastOp) && (
        <OperationDescription doc={getDoc('grant-mgmt', lastOp)!} className="mb-3" />
      )}

      <div className="space-y-3">
        <Input
          label="Access Token"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder="Bearer token with grant_management_query or grant_management_revoke scope"
        />
        <Input
          label="Grant ID"
          value={grantId}
          onChange={(e) => setGrantId(e.target.value)}
          placeholder="The grant_id obtained from a token response"
        />
      </div>

      <label className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 cursor-pointer mb-3">
        <input
          type="checkbox"
          checked={useDpop}
          onChange={(e) => setUseDpop(e.target.checked)}
          disabled={!canDpop}
          className="w-3.5 h-3.5 accent-indigo-500 mt-0.5 shrink-0 cursor-pointer"
        />
        <span className="text-xs text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">Present with the DPoP scheme</span>{' '}
          {canDpop ? (
            <>
              — required for a sender-constrained token (RFC 9449 §7.1);{' '}
              <code className="text-indigo-300">Bearer</code> is refused with{' '}
              <code className="text-indigo-300">[A281305]</code>.
              {isDpopBound && ' The token in hand is DPoP-bound, so this is on by default.'}
            </>
          ) : (
            '— no DPoP key in this session. Run an authorization-code flow with DPoP enabled first.'
          )}
        </span>
      </label>

      {error && <ErrorExplainer error={error} className="mb-3" />}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!accessToken || !grantId || loading}
          loading={loading}
          onClick={handleQuery}
        >
          Query
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={!accessToken || !grantId || loading}
          loading={loading}
          onClick={handleRevoke}
        >
          Revoke
        </Button>
      </div>

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { GrantManagementSection };
