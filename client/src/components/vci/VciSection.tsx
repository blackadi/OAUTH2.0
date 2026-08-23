import { toast } from 'sonner';
import { useUrlState } from '@/hooks/useUrlState';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { SplitPane } from '@/components/ui/SplitPane';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { useCredentials } from '@/context/CredentialContext';
import { VciDiscoveryPanel, isDiscoveryOp } from './VciDiscoveryPanels';
import { VciOfferPanels } from './VciOfferPanels';
import { VciCredentialPanels } from './VciCredentialPanels';
import { ALL_OPS, GROUPS, VCI_OPS, VC_STEPS, toOpGroup, type VciOp } from './vci-operations';

/**
 * VCI — nine operations in three groups, and **three different authentication postures**.
 *
 * | Group | What authenticates the call |
 * |---|---|
 * | Discovery | nothing — public `GET` |
 * | Offers | this deployment's admin Basic auth |
 * | Credential | an access token |
 *
 * That table is why this decomposition follows the groups: getting the category wrong is exactly how
 * `POST /api/vci/deferred/issue` came to authenticate nobody while its two siblings on the same router
 * answered `401`. **The asymmetry was the bug**, and it was found by `check-route-coverage.mjs` rather
 * than by reading a 561-line switch. One file per posture makes the posture a property of the file.
 *
 * What is left here is what the three genuinely share: the tab bars, the flow diagram, one result pane
 * and one error banner.
 */
function VciSection() {
  const [activeOp, setActiveOp] = useUrlState<VciOp>('op', ALL_OPS);
  const { loading, result, error, call } = useAsyncCall();
  // The management credential is shared for the page rather than owned here: eight sections held their
  // own copy, and a route change unmounts a section, so it had to be retyped on every navigation.
  const { clientId: adminId, clientSecret: adminSecret } = useCredentials();

  const auth = adminId && adminSecret ? btoa(`${adminId}:${adminSecret}`) : '';
  const doc = activeOp ? getDoc('vci', activeOp) : undefined;
  const currentGroup = activeOp ? toOpGroup(activeOp) : undefined;

  /** One place a VCI call is made, whichever panel asked for it. */
  const onRun = (run: () => Promise<unknown>) => {
    void (async () => {
      const { data, error: err } = await call(run);
      if (data) toast.success(`${activeOp ?? 'operation'} completed`);
      else toast.error(err);
    })();
  };

  const panel = (op: VciOp) => {
    if (isDiscoveryOp(op)) return <VciDiscoveryPanel op={op} loading={loading} onRun={onRun} />;
    if (op === 'offer-create' || op === 'offer-info')
      return <VciOfferPanels op={op} auth={auth} loading={loading} onRun={onRun} />;
    return <VciCredentialPanels op={op} loading={loading} onRun={onRun} />;
  };

  return (
    <SectionPanel
      title="Verifiable Credential Issuance (OID4VCI)"
      description="Issue verifiable credentials via Authlete"
    >
      {/* How VCI Works — Collapsible Guidance */}
      <details className="mb-5 p-3 rounded-lg bg-tint-accent border border-edge-accent group" open>
        <summary className="text-xs text-accent-text font-medium cursor-pointer list-none flex items-center gap-2 select-none">
          <span className="text-xs opacity-60 group-open:opacity-100 transition-transform">▶</span>
          How VCI works — step-by-step guide
        </summary>
        <div className="mt-3 space-y-3 text-xs text-accent-text">
          <p>
            OID4VCI lets a wallet app request signed digital credentials from this server. The
            server delegates credential issuance to Authlete. There are two flows:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-2 rounded bg-tint-accent border border-edge-accent">
              <p className="font-medium text-accent-text mb-1">Flow A: Pre-Authorized Code</p>
              <ol className="list-decimal ml-4 space-y-0.5 text-accent-text">
                <li>
                  <strong>Discover</strong> — Check what credential types the server supports
                  (Metadata tab)
                </li>
                <li>
                  <strong>Create Offer</strong> (admin) — Create an offer with pre-authorized code
                  grant
                </li>
                <li>
                  Copy the <code>preAuthorizedCode</code> from the offer response
                </li>
                <li>
                  <strong>Get Token</strong> — Exchange the code at the token endpoint:{' '}
                  <code>
                    grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code&pre-authorized_code=&lt;code&gt;
                  </code>
                </li>
                <li>
                  <strong>Issue</strong> — Paste the access token and request a credential
                </li>
              </ol>
            </div>
            <div className="p-2 rounded bg-tint-accent border border-edge-accent">
              <p className="font-medium text-accent-text mb-1">Flow B: Authorization Code</p>
              <ol className="list-decimal ml-4 space-y-0.5 text-accent-text">
                <li>
                  <strong>Discover</strong> — Check supported credential types
                </li>
                <li>
                  <strong>Create Offer</strong> (admin) — Create an offer with authorization code
                  grant
                </li>
                <li>
                  <strong>Get Token</strong> — Go to Auth Flows → Authorization Code, log in, get
                  tokens
                </li>
                <li>The access token is auto-populated in the Issue tab from the token vault</li>
                <li>
                  <strong>Issue</strong> — Paste the access token (if not already filled) and
                  request a credential
                </li>
              </ol>
            </div>
          </div>
          <p>
            After issuing, if the server returns <code>202 ACCEPTED</code> with a{' '}
            <code>transaction_id</code>, use the <strong>Deferred</strong> tab to poll for the
            credential — carrying the same access token, which that endpoint now requires. Use the{' '}
            <strong>Batch</strong> tab to request multiple credential types in one call (OID4VCI
            §10).
          </p>
        </div>
      </details>

      {/* Flow Diagram */}
      <FlowDiagram steps={VC_STEPS} currentStep={currentGroup} className="mb-5" />

      {/* Tab Groups */}
      {GROUPS.map((group) => (
        <div key={group} className="mb-4 last:mb-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">{group}</p>
          <TabBar
            options={VCI_OPS.filter((o) => o.group === group).map(({ value, label }) => ({
              value,
              label,
            }))}
            value={activeOp}
            onChange={setActiveOp}
          />
        </div>
      ))}

      {/* Error banner */}
      {error && <ErrorExplainer error={error} className="mb-3" />}

      {/* Operation docs */}
      {activeOp && doc && <OperationDescription doc={doc} />}

      {/* Split Pane: config left / response right */}
      {activeOp && (
        <SplitPane
          leftLabel="Configuration"
          rightLabel="Response"
          left={<div className="space-y-3">{panel(activeOp)}</div>}
          right={
            result ? (
              <JsonBlock data={result} />
            ) : (
              <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                Run an operation to see the response here
              </div>
            )
          }
        />
      )}

      {!activeOp && !!result && <JsonBlock data={result} label="Response" className="mt-4" />}
    </SectionPanel>
  );
}

export { VciSection };
