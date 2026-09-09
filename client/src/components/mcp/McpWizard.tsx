import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { FlowDiagram, type FlowStep } from '@/components/ui/FlowDiagram';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { getDoc } from '@/data/operationDocs';
import { stepState } from '@/utils/step-state';
import { useConfirmedAction } from '@/hooks/useConfirmedAction';
import { CLIENT_ID } from '@/config';
import type { McpFlow, McpStep } from './use-mcp-flow';

/**
 * The failure, rendered inside the step that produced it.
 *
 * **Where this used to be.** One `ErrorExplainer` at the top of `McpSection`, for all six steps at
 * once. Measured on the live page: a Step 4 failure rendered at absolute Y 347 while the button that
 * caused it sat at Y 2241 — 1,894px apart, more than two viewport heights, so at the button nothing
 * changed at all and the only feedback was a toast in the opposite corner. Two of them could also
 * stack, a tab lookup's and a wizard step's, with nothing to say which was which.
 *
 * That placement was not laziness: `loading` is cleared in the hook's `finally`, so until
 * `errorLabel` existed the failing step genuinely could not be named at render time, and the top of
 * the section was the only spot that was always correct.
 *
 * A step takes a *list* because Step 2 has two buttons — CIMD and DCR — and either can fail into the
 * same card.
 *
 * The explainer itself is why this is worth moving rather than deleting: an `[A157303]` here means the
 * exchange presented client-authentication data for a public client, and `[A157357]` means the
 * credentials arrived on the wrong channel. Both have answers written down in this repo and neither is
 * guessable from the raw string — which is no use at all two viewport heights from the button.
 */
function StepError({ flow, steps }: { flow: McpFlow; steps: McpStep[] }) {
  if (!flow.error || !flow.failedStep || !steps.includes(flow.failedStep)) return null;
  return <ErrorExplainer error={flow.error} />;
}

/**
 * The six steps as a map, above the six cards.
 *
 * MCP is the longest sequence in this application and was the only multi-step section with no
 * diagram — six cards spanning some 2,000px with nothing saying where in the protocol the reader
 * is, in a product that had already built the component and shipped it to five shorter flows.
 */
const MCP_STEPS: FlowStep[] = [
  { id: 'discover', label: 'Discover AS', description: 'Read the metadata and its capabilities.' },
  {
    id: 'register',
    label: 'Register',
    description: 'Optional — CIMD URL, or DCR with admin credentials.',
  },
  {
    id: 'authorize',
    label: 'Authorize',
    description: 'An S256 challenge plus the RFC 8707 resource.',
  },
  { id: 'token', label: 'Token', description: 'Exchange the code, repeating the resource.' },
  { id: 'userinfo', label: 'UserInfo', description: 'Who approved the access.' },
  {
    id: 'introspect',
    label: 'Introspect',
    description: 'RFC 7662 — what the token actually carries.',
  },
];

/**
 * Progress read from the wizard's own state, not from the request trace.
 *
 * A deliberate departure from `sequenceProgress`, which every other diagram in the app uses. That
 * helper matches a step to the endpoint whose successful call completes it, against the *global*
 * trace — and MCP's last three steps call `/api/token`, `/api/userinfo` and `/api/introspection`,
 * the same generic endpoints every other section calls. A reader who obtained a token in Grant
 * Flows would arrive here to find steps 4 to 6 already ticked. `DeviceSection` and the rest do not
 * have this problem because their endpoints are theirs alone.
 *
 * Reading the same values the cards gate on also means the diagram and the per-card "Done" badges
 * cannot disagree, which two sources of truth eventually would.
 */
function wizardProgress(flow: McpFlow): { completedSteps: string[]; currentStep?: string } {
  const done: Array<[string, boolean]> = [
    ['discover', Boolean(flow.asData)],
    ['register', flow.clientId !== CLIENT_ID],
    ['authorize', Boolean(flow.authUrl)],
    ['token', Boolean(flow.tokenResult)],
    ['userinfo', Boolean(flow.userinfoResult)],
    ['introspect', Boolean(flow.introspectResult)],
  ];
  return {
    completedSteps: done.filter(([, ok]) => ok).map(([id]) => id),
    currentStep: done.find(([, ok]) => !ok)?.[0],
  };
}

/**
 * One step of the wizard, gated or not.
 *
 * **Why the variant moves with the state.** `stepState` sets `border-dashed` — a border *style* — and
 * a `Card`'s default variant carries a shadow and no border *width*, so the dashed edge its docblock
 * promises resolved to `border-top-width: 0px`. The only surviving signal was `bg-muted/30`, measured
 * at roughly 2% luminance from a ready card on the light palette. Five of the six steps are gated on
 * arrival and none of them looked it, so readers clicked into dead cards — while `aria-disabled` was
 * announcing the state correctly all along, leaving sighted users strictly worse off than screen
 * reader users.
 *
 * `bordered` supplies the width that style needs and drops the shadow in the same move, which is what
 * DESIGN.md requires anyway: a card takes a border or a shadow, never both. Doing it here rather than
 * inside `stepState` is deliberate — that helper is also spread onto plain `<div>`s in
 * `FapiTestFlow`, which carry their own `border-t` and would take a `variant` prop React would then
 * warn about on a DOM element.
 *
 * **Every step is bordered, ready or not**, which is the second half of the same finding. The
 * detector reported seven `nested-cards`: `SectionPanel` paints `rounded-xl border bg-card` and each
 * step painted `rounded-xl bg-card` inside it — the same ground and the same radius at two levels, so
 * six steps read as one undifferentiated wall and the shadow that was meant to separate them is, by
 * DESIGN.md's own measurement, "near-black against a near-black ground and almost invisible". A
 * hairline is what actually separates them, and it is the system's north star anyway: a ruled
 * rectangle. Ready and gated then differ by border *style* — solid against dashed — plus the recessed
 * fill and the disabled controls.
 *
 * **The `fieldset` closes the other half of "not yet".** `pointer-events-none` stops a mouse and
 * nothing else, so a gated step's controls stayed in the tab order and stayed typeable: measured on
 * the live page, steps 2, 3 and 4 offered 2, 4 and 3 tabbable controls each while announcing
 * `aria-disabled`. A keyboard user could fill in a step the interface had declared unreachable.
 * `FapiTestFlow` never had this — its two gated steps contain one button apiece, each already
 * carrying its own `disabled`, and measured zero tabbable descendants.
 *
 * `inert` is the shorter spelling and the wrong one: it also removes the subtree from the
 * accessibility tree, and this wizard renders all six steps at once precisely so the whole flow can
 * be read before any of it is run. Hiding five of six from a screen reader on arrival trades one
 * access failure for a worse one. A disabled `fieldset` disables its descendant form controls —
 * dropping them from the tab order and marking them disabled — while leaving every word readable.
 * `display: contents` keeps it out of the layout, and the controls pick up the `disabled:opacity-50`
 * that `step-state.ts` already sanctions for inactive controls (WCAG 2.1 SC 1.4.3 exempts them).
 */
interface StepCardProps {
  id: string;
  ready: boolean;
  title: string;
  /** Badges and the spinner — whatever the step says about itself beside its name. */
  status?: ReactNode;
  /**
   * What the reader has to do first, shown only while the step is gated.
   *
   * A step that says "not yet" without saying "not yet until what" has told the reader they are stuck
   * and nothing else. Five of the six are gated on arrival, so this is the copy that turns a wall of
   * dead cards into a sequence — and it names the step to run, not the state to acquire, because
   * "needs `asData`" is a sentence about this codebase rather than about the reader's next click.
   */
  blockedBy?: string;
  children: ReactNode;
}

function StepCard({ id, ready, title, status, blockedBy, children }: StepCardProps) {
  return (
    <Card id={id} tabIndex={-1} variant="bordered" {...stepState(ready, 'mb-3')}>
      {/* The title is set here rather than at six call sites, which is how step 6 came to render at
          18px against its siblings' 14px: one `text-sm` was missing and nothing could see it. */}
      <CardHeader>
        {/* `h3`, not the default `h2`: these are children of the wizard's own `h2` below, and marking
            them as its peers presented six steps as siblings of the thing that contains them. */}
        <CardTitle as="h3" className="text-sm flex items-center gap-2">
          {title}
          {status}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!ready && blockedBy && <p className="text-xs text-muted-foreground mb-3">{blockedBy}</p>}
        <fieldset disabled={!ready} className="contents">
          {children}
        </fieldset>
      </CardContent>
    </Card>
  );
}

/**
 * The six cards of the MCP flow, and nothing else.
 *
 * All of the sequencing lives in `use-mcp-flow.ts`; this file decides only what a step looks like and
 * when it is available. `stepState` greys a card whose prerequisite has not happened yet — which is the
 * one piece of logic that belongs here, because "can this step be attempted" is a rendering question and
 * **gating a step on the response object rather than on the field it is about to use** is how the FAPI
 * wizard came to have an enabled button that did nothing.
 */
function McpWizard({ flow }: { flow: McpFlow }) {
  /**
   * Rebuilding the authorization URL throws away a code the reader may already be holding.
   *
   * A fresh verifier per authorization request is correct, so the code that belonged to the previous
   * challenge stops being exchangeable the moment step 3 runs again — which used to happen silently
   * and surfaced two steps later as `invalid_grant`. The plain confirmation form, with no typed
   * value: `ConfirmDialog`'s own rule is that a typing test is for things that reach the
   * authorization server irreversibly, and this one's blast radius is a field in this tab.
   */
  const { confirm, dialog } = useConfirmedAction();
  const buildAuthUrl = () => {
    if (!flow.code) {
      void flow.stepAuthorize();
      return;
    }
    confirm({
      title: 'Start a new authorization?',
      body: 'This mints a fresh PKCE verifier, which the authorization code already in Step 4 cannot be exchanged against. That code will be cleared.',
      confirmLabel: 'Start over',
      run: flow.stepAuthorize,
    });
  };

  return (
    <div className="mt-6 pt-4 border-t border-border">
      {/* `font-semibold`, matching the steps: at `font-medium` the container rendered lighter than
          the six headings inside it, which is a rank inversion rather than a rank. */}
      <h2 className="text-sm font-semibold text-foreground mb-3">Full MCP Flow Wizard</h2>
      {/* `max-w-prose`: this ran to ~153 characters a line, the one line-length finding the detector
          attributed to this file while every sibling caption already carried the measure. */}
      <p className="text-xs text-muted-foreground mb-4 max-w-prose">
        Walk through the complete MCP OAuth 2.1 flow step by step: discover the AS, register a
        client, authorize, exchange tokens, and fetch user info.
      </p>

      <FlowDiagram {...wizardProgress(flow)} steps={MCP_STEPS} className="mb-4" />

      {/* ── Step 1: Discovery ─────────────────────────── */}
      <StepCard
        id="mcp-step-1"
        ready
        title="Step 1: Discover AS"
        status={
          <>
            {flow.asData && <Badge variant="success">Done</Badge>}
            {flow.loading === 'Discover AS' && <Spinner size="sm" />}
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Issuer URL"
            value={flow.issuer}
            onChange={(e) => flow.setIssuer(e.target.value)}
            placeholder="http://localhost:3000"
          />
          <Button onClick={flow.stepDiscover} loading={flow.loading === 'Discover AS'}>
            Fetch Metadata
          </Button>
          {flow.asData && (
            <div className="flex flex-wrap gap-2 mt-2">
              {flow.asData.issuer && (
                <Badge variant="info">Issuer: {String(flow.asData.issuer).slice(0, 40)}</Badge>
              )}
              {flow.asData.registration_endpoint && <Badge variant="success">DCR Supported</Badge>}
              {flow.asData.resource_indicators_supported && (
                <Badge variant="success">Resource Indicators</Badge>
              )}
              {Array.isArray(flow.asData.code_challenge_methods_supported) &&
                flow.asData.code_challenge_methods_supported.includes('S256') && (
                  <Badge variant="success">PKCE S256</Badge>
                )}
            </div>
          )}
          <StepError flow={flow} steps={['Discover AS']} />
        </div>
      </StepCard>

      {/* ── Step 2: Register Client ────────────────────── */}
      <StepCard
        id="mcp-step-2"
        ready={Boolean(flow.asData)}
        title="Step 2 (optional): Register Client"
        blockedBy="Run Step 1 first — this step reads the registration endpoint out of the AS metadata."
        status={
          <>
            {flow.clientId !== CLIENT_ID && <Badge variant="success">Done</Badge>}
            {(flow.loading === 'Fetch CIMD' || flow.loading === 'DCR Register') && (
              <Spinner size="sm" />
            )}
          </>
        }
      >
        <div className="space-y-3">
          {/* Step 3 gates on the AS metadata and never on this one, so the numbering overstates it:
              the flow runs end to end with the client ID already in the field below. Saying so is
              cheaper than a reader working it out from two `stepState` calls. */}
          <p className="text-xs text-muted-foreground">
            Optional — Step 3 needs Step 1, not this one. Skip it to authorize with the client ID
            already filled in below.
          </p>
          {/* The field comes before the buttons because it is what turns one of them on. It used to
              sit underneath, so the control and its precondition were in the wrong reading order. */}
          <Input
            label="CIMD URL (for CIMD flow)"
            value={flow.cimdUrl}
            onChange={(e) => flow.setCimdUrl(e.target.value)}
            placeholder="https://myapp.com/.well-known/oauth-client"
            hint="An HTTPS URL serving your client's metadata document. The URL itself becomes the `client_id`, and it is what enables the CIMD button below."
          />
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={flow.stepCimd}
              loading={flow.loading === 'Fetch CIMD'}
              disabled={!flow.cimdUrl}
              variant="default"
            >
              CIMD (URL as client_id)
            </Button>
            <Button
              onClick={flow.stepDcr}
              loading={flow.loading === 'DCR Register'}
              disabled={!flow.hasAdminCredential}
              variant="default"
            >
              DCR (admin register)
            </Button>
          </div>
          {!flow.hasAdminCredential && (
            <p className="text-xs text-muted-foreground">
              DCR registration needs the admin credentials at the top of this section.
            </p>
          )}
          {flow.cimdData && (
            <div className="flex flex-wrap gap-2">
              {flow.cimdData.client_name && (
                <Badge variant="info">{String(flow.cimdData.client_name)}</Badge>
              )}
              {flow.cimdData.token_endpoint_auth_method && (
                <Badge variant="info">
                  Auth: {String(flow.cimdData.token_endpoint_auth_method)}
                </Badge>
              )}
              {flow.cimdData.scope && (
                <Badge variant="info">Scope: {String(flow.cimdData.scope)}</Badge>
              )}
            </div>
          )}
          <Input
            label="Client ID (auto-filled)"
            value={flow.clientId}
            onChange={(e) => flow.setClientId(e.target.value)}
            placeholder="client_id or CIMD URL"
          />
          <StepError flow={flow} steps={['Fetch CIMD', 'DCR Register']} />
        </div>
      </StepCard>

      {/* ── Step 3: Authorize ──────────────────────────── */}
      <StepCard
        id="mcp-step-3"
        ready={Boolean(flow.asData)}
        title="Step 3: Authorize (PKCE + Resource)"
        blockedBy="Run Step 1 first — the authorization URL is built from the endpoints in the AS metadata."
        status={flow.authUrl ? <Badge variant="success">URL Built</Badge> : null}
      >
        {getDoc('mcp', 'authorize-url') && (
          <OperationDescription doc={getDoc('mcp', 'authorize-url')!} className="mb-3" />
        )}
        <div className="space-y-3">
          <Input
            label="Redirect URI"
            value={flow.redirectUri}
            onChange={(e) => flow.setRedirectUri(e.target.value)}
          />
          <Input
            label="Scopes"
            value={flow.scopes}
            onChange={(e) => flow.setScopes(e.target.value)}
          />
          <Input
            label="Resource (optional — MCP server URL)"
            value={flow.resource}
            onChange={(e) => flow.setResource(e.target.value)}
            placeholder="https://mcp-server.example.com"
          />
          <Button onClick={buildAuthUrl} disabled={!flow.asData || !flow.clientId}>
            Build Authorization URL
          </Button>
          {flow.authUrl && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Authorizing leaves this page and returns to Step 4 with the code already exchanged.
                The URL is here to read first — it is the artifact this step exists to show.
              </p>
              {/* Selectable text rather than a `target="_blank"` link. The new tab was the previous
                  behaviour and it is the one shape that defeats the verifier this step writes down:
                  session storage is per-tab, so the callback would look for it and find nothing. */}
              <p className="text-xs text-accent-text break-all font-mono">{flow.authUrl}</p>
              <Button onClick={flow.goAuthorize}>Authorize in this tab</Button>
            </div>
          )}
        </div>
      </StepCard>

      {/* ── Step 4: Token Exchange ─────────────────────── */}
      <StepCard
        id="mcp-step-4"
        ready={Boolean(flow.authUrl)}
        title="Step 4: Token Exchange"
        blockedBy="Build the authorization URL in Step 3 first, then bring the code back from the callback."
        status={
          <>
            {flow.tokenResult && <Badge variant="success">Done</Badge>}
            {flow.loading === 'Exchange Code' && <Spinner size="sm" />}
          </>
        }
      >
        {getDoc('mcp', 'token-exchange') && (
          <OperationDescription doc={getDoc('mcp', 'token-exchange')!} className="mb-3" />
        )}
        <div className="space-y-3">
          <Input
            label="Authorization Code (from callback)"
            value={flow.code}
            onChange={(e) => flow.setCode(e.target.value)}
            placeholder="Paste code from ?code=... in callback URL"
          />
          <Input
            label="Code Verifier (auto-filled)"
            value={flow.codeVerifier}
            onChange={(e) => flow.setCodeVerifier(e.target.value)}
          />
          <Button
            onClick={flow.stepToken}
            loading={flow.loading === 'Exchange Code'}
            disabled={!flow.code || !flow.codeVerifier}
          >
            Exchange Code for Token
          </Button>
          <StepError flow={flow} steps={['Exchange Code']} />
        </div>
      </StepCard>

      {/* ── Step 5: UserInfo ───────────────────────────── */}
      <StepCard
        id="mcp-step-5"
        ready={Boolean(flow.tokenResult)}
        title="Step 5: Fetch UserInfo"
        blockedBy="Exchange a code for an access token in Step 4 first."
        status={
          <>
            {flow.userinfoResult && <Badge variant="success">Done</Badge>}
            {flow.loading === 'Fetch UserInfo' && <Spinner size="sm" />}
          </>
        }
      >
        {getDoc('mcp', 'userinfo') && (
          <OperationDescription doc={getDoc('mcp', 'userinfo')!} className="mb-3" />
        )}
        <div className="space-y-3">
          <Button
            onClick={flow.stepUserinfo}
            loading={flow.loading === 'Fetch UserInfo'}
            disabled={!flow.tokenResult}
          >
            Fetch UserInfo
          </Button>
          <StepError flow={flow} steps={['Fetch UserInfo']} />
        </div>
      </StepCard>

      {/* ── Step 6: Introspect ─────────────────────────── */}
      <StepCard
        id="mcp-step-6"
        ready={Boolean(flow.tokenResult)}
        title="Step 6: Introspect Token"
        blockedBy="Exchange a code for an access token in Step 4 first."
        status={
          <>
            {flow.introspectResult && <Badge variant="success">Done</Badge>}
            {flow.loading === 'Introspect' && <Spinner size="sm" />}
          </>
        }
      >
        <div className="space-y-3">
          {getDoc('mcp', 'introspect') && (
            <OperationDescription doc={getDoc('mcp', 'introspect')!} />
          )}
          <Button
            onClick={flow.stepIntrospect}
            loading={flow.loading === 'Introspect'}
            disabled={!flow.tokenResult}
          >
            Introspect
          </Button>
          <StepError flow={flow} steps={['Introspect']} />
        </div>
      </StepCard>

      {/* ── Results ─────────────────────────────────────── */}
      {flow.tokenResult && (
        <div className="mt-3">
          <JsonBlock data={flow.tokenResult} label="Token Response" />
        </div>
      )}
      {flow.userinfoResult && (
        <div className="mt-3">
          <JsonBlock data={flow.userinfoResult} label="UserInfo Response" />
        </div>
      )}
      {flow.introspectResult && (
        <div className="mt-3">
          <JsonBlock data={flow.introspectResult} label="Introspection Response" />
        </div>
      )}

      {dialog}
    </div>
  );
}

export { McpWizard };
