import { useState } from 'react';
import { toast } from 'sonner';
import { vciService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { useToken } from '@/context/TokenContext';
import { TabBar } from '@/components/ui/TabBar';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { SplitPane } from '@/components/ui/SplitPane';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';

type VciOp = 'metadata' | 'jwtissuer' | 'jwks' | 'wellknown' | 'offer-create' | 'offer-info' | 'cred-issue' | 'cred-batch' | 'deferred-issue';

const VCI_OPS: { value: VciOp; label: string; group: string }[] = [
  { value: 'metadata', label: 'Metadata', group: 'Discovery' },
  { value: 'jwtissuer', label: 'JWT Issuer', group: 'Discovery' },
  { value: 'jwks', label: 'JWKS', group: 'Discovery' },
  { value: 'wellknown', label: 'Well-Known', group: 'Discovery' },
  { value: 'offer-create', label: 'Create Offer', group: 'Offers' },
  { value: 'offer-info', label: 'Get Offer Info', group: 'Offers' },
  { value: 'cred-issue', label: 'Issue', group: 'Credential' },
  { value: 'cred-batch', label: 'Batch', group: 'Credential' },
  { value: 'deferred-issue', label: 'Deferred', group: 'Credential' },
];

const GROUPS = ['Discovery', 'Offers', 'Credential'];

const VC_STEPS = [
  { id: 'discover', label: 'Discover' },
  { id: 'offer', label: 'Create Offer' },
  { id: 'token', label: 'Get Token' },
  { id: 'issue', label: 'Issue' },
];

function toOpGroup(op: VciOp): string {
  if (['metadata', 'jwtissuer', 'jwks', 'wellknown'].includes(op)) return 'discover';
  if (['offer-create', 'offer-info'].includes(op)) return 'offer';
  return 'issue';
}

function VciSection() {
  const [activeOp, setActiveOp] = useState<VciOp | null>(null);
  const { loading, result, error, call } = useAsyncCall();
  const { getAccessToken } = useToken();

  // --- Shared offer state ---
  const [adminId, setAdminId] = useState('');
  const [adminSecret, setAdminSecret] = useState('');
  const [offerCredConfigIds, setOfferCredConfigIds] = useState('["VerifiedEmployee"]');
  const [offerSubject, setOfferSubject] = useState('');
  const [offerDuration, setOfferDuration] = useState('');
  const [preAuthGrant, setPreAuthGrant] = useState(true);
  const [authCodeGrant, setAuthCodeGrant] = useState(false);
  const [offerContext, setOfferContext] = useState('');
  const [txCodeVal, setTxCodeVal] = useState('');
  const [txCodeMode, setTxCodeMode] = useState('');
  const [txCodeDesc, setTxCodeDesc] = useState('');
  const [offerIdentifier, setOfferIdentifier] = useState('');

  // --- Shared credential state ---
  const [credAccessToken, setCredAccessToken] = useState(() => getAccessToken() || '');
  const [issueOrderJson, setIssueOrderJson] = useState('{"requestIdentifier":"cred-1"}');
  const [batchRequestsJson, setBatchRequestsJson] = useState('[{"format":"vc+sd-jwt","vct":"https://credentials.example.com/identity_credential"}]');
  const [deferredOrderJson, setDeferredOrderJson] = useState('{"transactionId":"..."}');

  const auth = adminId && adminSecret ? btoa(`${adminId}:${adminSecret}`) : '';
  const doc = activeOp ? getDoc('vci', activeOp) : undefined;

  const handleCall = async (fn: () => Promise<unknown>) => {
    const { data, error: err } = await call(fn);
    if (data) toast.success(`${activeOp} completed`);
    else toast.error(err);
  };

  const handleTokenFocus = () => {
    const stored = getAccessToken();
    if (stored && !credAccessToken) setCredAccessToken(stored);
  };

  function renderCheckbox(label: string, checked: boolean, onChange: (v: boolean) => void) {
    return (
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
          className="accent-indigo-500 w-3.5 h-3.5 rounded border-border bg-muted/30" />
        {label}
      </label>
    );
  }

  const renderOp = (op: VciOp) => {
    switch (op) {
      case 'metadata':
        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">GET /api/vci/metadata</p>
            <p className="text-xs text-muted-foreground/60">Returns the credential issuer metadata including supported credential configurations.</p>
            <Button onClick={() => handleCall(() => vciService.getMetadata())} loading={loading}>Fetch Metadata</Button>
          </div>
        );
      case 'jwtissuer':
        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">GET /api/vci/jwtissuer</p>
            <p className="text-xs text-muted-foreground/60">Returns JWT VC issuer metadata (issuer identifier + JWKS URI).</p>
            <Button onClick={() => handleCall(() => vciService.getJwtIssuer())} loading={loading}>Fetch JWT Issuer</Button>
          </div>
        );
      case 'jwks':
        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">GET /api/vci/jwks</p>
            <p className="text-xs text-muted-foreground/60">Returns the public keys used to sign verifiable credentials.</p>
            <Button onClick={() => handleCall(() => vciService.getJwks())} loading={loading}>Fetch JWKS</Button>
          </div>
        );
      case 'wellknown':
        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">GET /api/vci/well-known</p>
            <p className="text-xs text-muted-foreground/60">Same as Metadata, but served at the OID4VCI-specified well-known path (convenience alias).</p>
            <Button onClick={() => handleCall(() => vciService.getWellKnown())} loading={loading}>Fetch Well-Known</Button>
          </div>
        );
      case 'offer-create': {
        return (
          <div className="space-y-4">
            <AdminAuth clientId={adminId} clientSecret={adminSecret} onClientIdChange={setAdminId} onClientSecretChange={setAdminSecret} label="Admin" />
            <Input label="Credential Configuration IDs (JSON array)" value={offerCredConfigIds} onChange={(e) => setOfferCredConfigIds(e.target.value)} placeholder='["VerifiedEmployee"]' />
            <Input label="Subject (optional)" value={offerSubject} onChange={(e) => setOfferSubject(e.target.value)} placeholder="user123" />
            <Input label="Duration in seconds (optional)" value={offerDuration} onChange={(e) => setOfferDuration(e.target.value)} placeholder="3600" />
            <Input label="Context (optional)" value={offerContext} onChange={(e) => setOfferContext(e.target.value)} placeholder="Free-form context string" />
            <div className="space-y-1">
              <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground/60">Grant Types</p>
              <div className="flex flex-wrap gap-4">
                {renderCheckbox('Pre-Authorized Code', preAuthGrant, setPreAuthGrant)}
                {renderCheckbox('Authorization Code', authCodeGrant, setAuthCodeGrant)}
              </div>
            </div>
            {preAuthGrant && (
              <div className="space-y-3 pl-3 border-l-2 border-indigo-500/30">
                <p className="text-xs text-indigo-300/60">Transaction code (tx_code) settings for pre-authorized code flow</p>
                <Input label="Transaction Code (optional)" value={txCodeVal} onChange={(e) => setTxCodeVal(e.target.value)} placeholder="e.g. 123456" />
                <Select label="Input Mode" options={[
                  { value: '', label: '(none)' },
                  { value: 'numeric', label: 'Numeric' },
                  { value: 'text', label: 'Text' },
                ]} value={txCodeMode} onChange={(e) => setTxCodeMode(e.target.value)} />
                <Input label="Description (optional)" value={txCodeDesc} onChange={(e) => setTxCodeDesc(e.target.value)} placeholder="e.g. Enter the code shown on screen" />
              </div>
            )}
            <Button onClick={() => {
              const body: Record<string, unknown> = {};
              try { body.credentialConfigurationIds = JSON.parse(offerCredConfigIds); } catch { body.credentialConfigurationIds = [offerCredConfigIds]; }
              if (offerSubject) body.subject = offerSubject;
              if (offerDuration) body.duration = Number(offerDuration);
              if (offerContext) body.context = offerContext;
              body.preAuthorizedCodeGrantIncluded = preAuthGrant;
              body.authorizationCodeGrantIncluded = authCodeGrant;
              if (preAuthGrant && txCodeVal) {
                body.txCode = txCodeVal;
                if (txCodeMode) body.txCodeInputMode = txCodeMode;
                if (txCodeDesc) body.txCodeDescription = txCodeDesc;
              }
              handleCall(() => vciService.createOffer(body, auth));
            }} loading={loading}>Create Offer</Button>
          </div>
        );
      }
      case 'offer-info':
        return (
          <div className="space-y-3">
            <AdminAuth clientId={adminId} clientSecret={adminSecret} onClientIdChange={setAdminId} onClientSecretChange={setAdminSecret} label="Admin" />
            <Input label="Offer Identifier" value={offerIdentifier} onChange={(e) => setOfferIdentifier(e.target.value)} placeholder="offer-id" />
            <Button onClick={() => handleCall(() => vciService.getOfferInfo({ identifier: offerIdentifier }, auth))} loading={loading}>Get Offer Info</Button>
          </div>
        );
      case 'cred-issue':
        return (
          <div className="space-y-3">
            <Input label="Access Token" value={credAccessToken} onChange={(e) => setCredAccessToken(e.target.value)} placeholder="access-token"
              onFocus={handleTokenFocus} />
            <p className="text-xs text-muted-foreground">
              Uses <code>Authorization: Bearer</code> header. Auto-filled from token vault on focus. Get a token from <strong>Auth Flows</strong> (authorization code, client credentials, or pre-authorized code).
            </p>
            <Textarea label="Order (JSON)" rows={6} value={issueOrderJson} onChange={(e) => setIssueOrderJson(e.target.value)}
              placeholder='{"requestIdentifier":"cred-1"}' />
            <Button onClick={() => {
              let order: unknown = {};
              try { order = JSON.parse(issueOrderJson); } catch { order = { requestIdentifier: issueOrderJson }; }
              handleCall(() => vciService.issueCredential({ accessToken: credAccessToken, order }));
            }} loading={loading}>Issue Credential</Button>
          </div>
        );
      case 'cred-batch':
        return (
          <div className="space-y-3">
            <Input label="Access Token" value={credAccessToken} onChange={(e) => setCredAccessToken(e.target.value)} placeholder="access-token"
              onFocus={handleTokenFocus} />
            <p className="text-xs text-muted-foreground">Request multiple credential types at once (OID4VCI §10). Each entry specifies the format and credential type.</p>
            <div className="p-2 rounded bg-indigo-500/8 border border-indigo-500/20">
              <p className="text-xs text-indigo-300/70">
                <strong>credential_requests</strong> format (OID4VCI):<br />
                <code className="text-[0.6rem]">{'[{"format":"vc+sd-jwt","vct":"..."},{"format":"mso_mdoc","doctype":"..."}]'}</code>
              </p>
            </div>
            <Textarea label="Requests (JSON array)" rows={8} value={batchRequestsJson} onChange={(e) => setBatchRequestsJson(e.target.value)}
              placeholder='[{"format":"vc+sd-jwt","vct":"https://credentials.example.com/identity_credential"},{"format":"mso_mdoc","doctype":"org.iso.18013.5.1.mDL"}]' />
            <Button onClick={() => {
              let parsed: unknown = [];
              try { parsed = JSON.parse(batchRequestsJson); } catch { parsed = []; }
              handleCall(() => vciService.batchCredential({ accessToken: credAccessToken, credential_requests: parsed }));
            }} loading={loading}>Batch Issue</Button>
          </div>
        );
      case 'deferred-issue':
        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Poll for a credential that was deferred (returned 202 Accepted with <code>transaction_id</code>). Set the <code>transactionId</code> from the issue response.
            </p>
            <Textarea label="Order (JSON)" rows={6} value={deferredOrderJson} onChange={(e) => setDeferredOrderJson(e.target.value)}
              placeholder='{"transactionId":"..."}' />
            <Button onClick={() => {
              let order: unknown = {};
              try { order = JSON.parse(deferredOrderJson); } catch { order = { requestIdentifier: deferredOrderJson }; }
              handleCall(() => vciService.issueDeferred({ order }));
            }} loading={loading}>Issue Deferred</Button>
          </div>
        );
    }
  };

  const currentGroup = activeOp ? toOpGroup(activeOp) : undefined;

  return (
    <SectionPanel title="Verifiable Credential Issuance (OID4VCI)" description="Issue verifiable credentials via Authlete">
      {/* How VCI Works — Collapsible Guidance */}
      <details className="mb-5 p-3 rounded-lg bg-indigo-500/8 border border-indigo-500/20 group" open>
        <summary className="text-xs text-indigo-300 font-medium cursor-pointer list-none flex items-center gap-2 select-none">
          <span className="text-xs opacity-60 group-open:opacity-100 transition-transform">▶</span>
          How VCI works — step-by-step guide
        </summary>
        <div className="mt-3 space-y-3 text-xs text-indigo-200/70">
          <p>
            OID4VCI lets a wallet app request signed digital credentials from this server.
            The server delegates credential issuance to Authlete. There are two flows:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-2 rounded bg-indigo-500/10 border border-indigo-500/20">
              <p className="font-medium text-indigo-200 mb-1">Flow A: Pre-Authorized Code</p>
              <ol className="list-decimal ml-4 space-y-0.5 text-indigo-200/60">
                <li><strong>Discover</strong> — Check what credential types the server supports (Metadata tab)</li>
                <li><strong>Create Offer</strong> (admin) — Create an offer with pre-authorized code grant</li>
                <li>Copy the <code>preAuthorizedCode</code> from the offer response</li>
                <li><strong>Get Token</strong> — Exchange the code at the token endpoint: <code>grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code&pre-authorized_code=&lt;code&gt;</code></li>
                <li><strong>Issue</strong> — Paste the access token and request a credential</li>
              </ol>
            </div>
            <div className="p-2 rounded bg-indigo-500/10 border border-indigo-500/20">
              <p className="font-medium text-indigo-200 mb-1">Flow B: Authorization Code</p>
              <ol className="list-decimal ml-4 space-y-0.5 text-indigo-200/60">
                <li><strong>Discover</strong> — Check supported credential types</li>
                <li><strong>Create Offer</strong> (admin) — Create an offer with authorization code grant</li>
                <li><strong>Get Token</strong> — Go to Auth Flows → Authorization Code, log in, get tokens</li>
                <li>The access token is auto-populated in the Issue tab from the token vault</li>
                <li><strong>Issue</strong> — Paste the access token (if not already filled) and request a credential</li>
              </ol>
            </div>
          </div>
          <p>
            After issuing, if the server returns <code>202 ACCEPTED</code> with a <code>transaction_id</code>,
            use the <strong>Deferred</strong> tab to poll for the credential.
            Use the <strong>Batch</strong> tab to request multiple credential types in one call (OID4VCI §10).
          </p>
        </div>
      </details>

      {/* Flow Diagram */}
      <FlowDiagram steps={VC_STEPS} currentStep={currentGroup} className="mb-5" />

      {/* Tab Groups */}
      {GROUPS.map((group) => (
        <div key={group} className="mb-4 last:mb-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">{group}</p>
          <TabBar options={VCI_OPS.filter((o) => o.group === group).map(({ value, label }) => ({ value, label }))} value={activeOp} onChange={setActiveOp} />
        </div>
      ))}

      {/* Error banner */}
      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {/* Operation docs */}
      {activeOp && doc && <OperationDescription doc={doc} />}

      {/* Split Pane: config left / response right */}
      {activeOp && (
        <SplitPane
          leftLabel="Configuration"
          rightLabel="Response"
          left={<div className="space-y-3">{renderOp(activeOp)}</div>}
          right={result ? <JsonBlock data={result} /> : (
            <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-border text-xs text-muted-foreground/40">
              Run an operation to see the response here
            </div>
          )}
        />
      )}

      {!activeOp && !!result && <JsonBlock data={result} label="Response" className="mt-4" />}
    </SectionPanel>
  );
}

export { VciSection };
