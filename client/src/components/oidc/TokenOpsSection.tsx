import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useToken } from '@/context/TokenContext';
import { tokenService } from '@/services';
import { createProof, computeAth } from '@/services/dpop.service';
import type { JWK } from '@/services/crypto-utils';
import { CLIENT_ID, USERINFO_ENDPOINT } from '@/config';
import { useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { useUrlState } from '@/hooks/useUrlState';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { useConfirmedAction } from '@/hooks/useConfirmedAction';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { SESSION_KEYS, readKey, readJsonKey } from '@/services/session-keys';
import { useCredentials } from '@/context/CredentialContext';

type TokenOp = 'userinfo' | 'introspect' | 'introspect-std' | 'revoke';

/** Every value `TokenOp` can take, as a runtime list — the allowed set for the URL parameter. */
const ALL_OPS = [
  'userinfo',
  'introspect',
  'introspect-std',
  'revoke',
] as const satisfies readonly TokenOp[];

const OPS: { key: TokenOp; label: string }[] = [
  { key: 'userinfo', label: 'UserInfo' },
  { key: 'introspect', label: 'Introspect (Authlete)' },
  { key: 'introspect-std', label: 'Introspect (RFC 7662)' },
  { key: 'revoke', label: 'Revoke Token' },
];

function TokenOpsSection() {
  const { tokenSet, isDpopBound } = useToken();
  const at = tokenSet?.access_token;
  const dpopKey = readJsonKey<JWK>(SESSION_KEYS.dpopPrivateKey);

  /**
   * UserInfo is a protected resource, so the scheme is decided by the token, not by preference.
   *
   * This called `tokenService.userInfo()` unconditionally, which sends `Authorization: Bearer`. RFC
   * 9449 §7.1 gives a sender-constrained token no bearer option and §7.2 requires the refusal;
   * Authlete enforces it with `[A089311]`. Since the Grant Flows section used to mint a DPoP-bound
   * token whether you asked or not, the app's own headline flow produced a token this button could not
   * use — failing with a vendor code and no explanation.
   *
   * `ath` is REQUIRED when a proof accompanies an access token (§7.1) — and it is `ath`, not `sub`.
   */
  const fetchUserinfo = async () => {
    // A bound token with no key is not a bearer token. Falling through to `userInfo()` here sent
    // `Authorization: Bearer` for a token Authlete must refuse (`[A089311]`, RFC 9449 §7.2) — a request
    // that cannot succeed, reported as a vendor code rather than as the thing that is actually wrong.
    if (!isDpopBound) return tokenService.userInfo(at!);
    if (!dpopKey) {
      throw new Error(
        'This access token is DPoP-bound, but the DPoP private key is no longer in this session — so no valid proof can be built for it. RFC 9449 §7.1 gives a bound token no bearer alternative. Obtain a new token with DPoP enabled.',
      );
    }
    const ath = await computeAth(at!);
    const { data } = await tokenService.userInfoWithDpop(at!, (nonce) =>
      createProof(dpopKey, 'POST', USERINFO_ENDPOINT, ath, nonce),
    );
    return data;
  };
  const { loading, result, error, call } = useDiscriminatedAsyncCall();
  /**
   * The selected operation lives in the URL, so a specific step can be shared and Back undoes it.
   *
   * Was `useState`, which made a tab invisible to the address bar: *"look at what happened on the
   * introspection step"* could not be communicated, Back left the section rather than undoing the tab,
   * and a reload lost your place mid-protocol. `useUrlState` validates the incoming value against
   * `ALL_OPS`, so a hand-edited query cannot select a tab that does not exist.
   */
  const [activeOp, setActiveOp] = useUrlState<TokenOp>('op', ALL_OPS);

  const [revClientId, setRevClientId] = useState(readKey(SESSION_KEYS.activeClientId) || CLIENT_ID);
  const [revClientSecret, setRevClientSecret] = useState(
    readKey(SESSION_KEYS.activeClientSecret) || '',
  );

  // RFC 9470: Step-up auth validation inputs for Authlete introspection
  const [introspectAcrValues, setIntrospectAcrValues] = useState('');
  const [introspectMaxAge, setIntrospectMaxAge] = useState('');

  // RFC 7662 §2.1 requires the introspection endpoint to be protected. Both endpoints take this
  // deployment's admin credentials — see the note in services/token.service.ts.
  // The management credential is shared for the page rather than owned here: eight sections
  // held their own copy, and a route change unmounts a section, so it had to be retyped on
  // every navigation.
  const { clientId: adminId, clientSecret: adminSecret } = useCredentials();

  const doc = activeOp ? getDoc('token-ops', activeOp) : undefined;
  const { confirm, dialog } = useConfirmedAction();

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
        <div className="rounded-lg border border-edge-warning bg-tint-warning p-3 text-sm text-warning-text">
          <p className="font-medium">No access token available</p>
          <p className="mt-1 text-xs text-warning-text">
            Obtain a token first via the Grant Flows section (Authorization Code, Client
            Credentials, etc.), then return here.
          </p>
          <Link to="/auth-flows">
            <Button
              variant="outline"
              size="sm"
              className="mt-2 border-edge-warning text-warning-text hover:bg-tint-warning-strong"
            >
              Go to Grant Flows
            </Button>
          </Link>
        </div>
      )}

      {at && (
        <div className="rounded-lg border border-edge-success bg-tint-success p-2 text-xs text-success-text">
          Access token loaded: <code className="font-mono">{at.slice(0, 20)}...</code>
          {/* Which scheme it must be presented with is the difference between a 200 and [A089311],
              so it is stated rather than left to be discovered. */}
          <span className="ml-2 text-success-text">
            {isDpopBound
              ? dpopKey
                ? '· sender-constrained, so UserInfo is called with the DPoP scheme and a proof'
                : '· sender-constrained, but no DPoP key is in this session — UserInfo will be refused'
              : '· bearer token, presented with the Bearer scheme'}
          </span>
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
              /**
               * Revocation is the one operation here that destroys something, and RFC 7009 §2.1 makes
               * it apply to the whole grant when the server chooses to: revoking an access token may
               * take the refresh token with it. The other three read.
               */
              if (op.key === 'revoke') {
                confirm({
                  title: 'Revoke this access token?',
                  body: 'The token is revoked at the authorization server and stops working immediately. RFC 7009 §2.1 permits the server to revoke the whole grant, so the refresh token issued alongside it may go too. This cannot be undone from here.',
                  confirmLabel: 'Revoke token',
                  run: () =>
                    void handleCall('revoke', () =>
                      tokenService.revocation(
                        at!,
                        revClientId || undefined,
                        revClientSecret || undefined,
                        'access_token',
                      ),
                    ),
                });
                return;
              }
              void handleCall(op.key, () => {
                switch (op.key) {
                  case 'userinfo':
                    return fetchUserinfo();
                  case 'introspect': {
                    const opts: { acrValues?: string; maxAge?: number } = {};
                    if (introspectAcrValues.trim()) opts.acrValues = introspectAcrValues.trim();
                    if (introspectMaxAge.trim()) opts.maxAge = Number(introspectMaxAge.trim());
                    return tokenService.introspection(
                      at!,
                      adminId,
                      adminSecret,
                      Object.keys(opts).length ? opts : undefined,
                    );
                  }
                  case 'introspect-std':
                    return tokenService.introspectionStandard(at!, adminId, adminSecret);
                  case 'revoke':
                    // Unreachable: revocation is handled above, behind a confirmation. The case stays
                    // so the switch remains exhaustive over `TokenOp` — adding a fifth operation should
                    // be a compile error here, not a silent `undefined`.
                    throw new Error('revoke is handled by the confirmation path above');
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
          <Input
            label="Revocation Client ID"
            value={revClientId}
            onChange={(e) => setRevClientId(e.target.value)}
            placeholder="The client the token belongs to"
          />
          <Input
            label="Revocation Client Secret"
            type="password"
            value={revClientSecret}
            onChange={(e) => setRevClientSecret(e.target.value)}
            placeholder="Client secret for revocation auth"
          />
        </div>
      )}

      {(activeOp === 'introspect' || activeOp === 'introspect-std') && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            RFC 7662 §2.1 requires the introspection endpoint to be protected, so both endpoints
            take this deployment&apos;s admin credentials. Without them the server answers{' '}
            <code>401</code> and never reaches Authlete.
          </p>
          <AdminAuth />
        </div>
      )}

      {activeOp === 'introspect' && (
        <div className="space-y-3 rounded-lg border border-edge-info bg-tint-info p-3">
          <p className="text-xs font-medium text-info-text">
            RFC 9470 Step-Up Authentication Validation
          </p>
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
          <p className="text-2xs text-muted-foreground">
            If the token's ACR doesn't match or auth_time exceeds max_age, Authlete returns{' '}
            <code>insufficient_user_authentication</code> with the required values.
          </p>
        </div>
      )}

      {dialog}

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { TokenOpsSection };
