import { useId, useState, type ReactNode } from 'react';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { FlowDiagram, type FlowStep } from '@/components/ui/FlowDiagram';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc, type OpDoc } from '@/data/operationDocs';
import { useConfirmedAction } from '@/hooks/useConfirmedAction';
import { CLIENT_ID } from '@/config';
import type { McpFlow, McpStep } from './use-mcp-flow';

/** The `tx-doc` overrides every transcript section applies to the shared explainer. */
const DOC_CLASS = 'tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0';

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
 * same turn.
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
 * The six steps as a map, above the six turns.
 *
 * MCP is the longest sequence in this application and was the only multi-step section with no
 * diagram — six steps spanning some 2,000px with nothing saying where in the protocol the reader is,
 * in a product that had already built the component and shipped it to five shorter flows.
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
  { id: 'introspect', label: 'Introspect', description: 'RFC 7662 — what the token carries.' },
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
 * Reading the same values the turns gate on also means the diagram and the markers cannot disagree.
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
  /**
   * Back-filled from the last step that actually happened, not "every step whose flag is set".
   *
   * `currentStep` was the *first* incomplete step, and step 2 is optional — the turn says so and
   * tells the reader to skip it. So on the path the section recommends (discover, skip, authorize)
   * the diagram reported "Register: current" and "Authorize: completed": the you-are-here marker
   * pointing backwards at the step it had just told you not to take, and `aria-current="step"` with
   * it, so a screen reader was misdirected too.
   *
   * Back-filling is the same rule `utils/sequence-progress.ts` applies for the same reason — a later
   * success implies the earlier steps happened or were not needed, because these protocols cannot be
   * entered in the middle.
   */
  const lastDone = done.reduce((last, [, ok], i) => (ok ? i : last), -1);
  return {
    completedSteps: done.slice(0, lastDone + 1).map(([id]) => id),
    currentStep: done[lastDone + 1]?.[0],
  };
}

interface StepTurnProps {
  id: string;
  /** The step's position in the sequence, for the turn label. */
  n: number;
  label: string;
  /** The exchange this turn performs — the information a card never carried. */
  note?: string;
  ready: boolean;
  /** Whether this step has produced its result, which fills the marker. */
  landed?: boolean;
  busy?: boolean;
  doc?: OpDoc;
  /**
   * What the reader has to do first, shown only while the step is gated.
   *
   * A step that says "not yet" without saying "not yet until what" has told the reader they are
   * stuck and nothing else. Five of the six are gated on arrival, so this is the copy that turns a
   * wall of dead steps into a sequence — and it names the step to run, not the state to acquire,
   * because "needs `asData`" is a sentence about this codebase rather than about the next click.
   */
  blockedBy?: string;
  children: ReactNode;
}

/**
 * One step of the flow, as a transcript turn.
 *
 * **What this replaces, and why the card had to go.** Each step was a `<Card>` inside
 * `SectionPanel`, and the detector reported seven `nested-cards` because the two paint the same
 * `bg-card` ground at the same radius. Measured: the ready step was identical to the panel
 * containing it on all four card properties in both palettes. Adding a hairline separated the steps
 * from each other and made the ready one match its container exactly — the fix I claimed and did not
 * get. A turn is not a card, so the problem does not exist here: the spine and the marker carry the
 * structure and nothing shares a ground with anything.
 *
 * **The three parts of gating, because the transcript world has no gate.** Every sibling section
 * shows one operation at a time behind a tab, so nothing is ever unreachable; `data-state="pending"`
 * styles a turn *not yet reached* in a linear thread. MCP shows all six at once, which
 * `useUrlState.ts` records as deliberate — you can read step 4 before running step 1. So:
 *
 * 1. **Visual** — `data-state="pending"` gives a dashed marker and a muted label. That is a shape
 *    and a tone, where the card's gated fill measured 1.03–1.05:1 against a ready one with an
 *    identical border colour.
 * 2. **Operability** — the disabled `fieldset` stays. `pointer-events-none` stops a mouse and
 *    nothing else, so a gated step's controls stayed in the tab order and stayed typeable: measured,
 *    steps 2, 3 and 4 offered 2, 4 and 3 tabbable controls each while announcing they were disabled.
 *    `inert` is the shorter spelling and the wrong one — it also removes the subtree from the
 *    accessibility tree, and this wizard renders every step so the whole flow can be *read* first.
 * 3. **Announcement** — `aria-describedby` pointing at the `blockedBy` sentence, **not**
 *    `aria-disabled` on the turn. That is the defect this closes: `aria-disabled` on the container
 *    made assistive technology treat every descendant as unavailable, including the `HelpPopover`
 *    inside the explainer, so four Help buttons were announced as disabled on arrival. Describing the
 *    turn says *why* it is not ready, which is more than a flag ever did, and it stops the region
 *    suppressing the read affordances inside it. `utils/step-state.ts` still returns `aria-disabled`
 *    for `FapiTestFlow`, which has no sentence to point at.
 *
 * The label is an `h3` carrying `tx-turn-label`, where every sibling uses a bare `<span>`. The class
 * sets the face and size either way, and Tailwind's preflight zeroes the heading's margin — so the
 * six steps stay in the document outline as children of the wizard's `h2`, which is what they are.
 */
function StepTurn({
  id,
  n,
  label,
  note,
  ready,
  landed,
  busy,
  doc,
  blockedBy,
  children,
}: StepTurnProps) {
  const hintId = `${useId()}-blocked`;
  return (
    <div
      id={id}
      tabIndex={-1}
      className="tx-turn"
      data-dir={landed ? 'in' : 'out'}
      data-state={!ready ? 'pending' : landed ? 'landed' : undefined}
      aria-describedby={!ready && blockedBy ? hintId : undefined}
    >
      <span className="tx-marker" aria-hidden="true" />
      <div className="tx-turn-head">
        <h3 className="tx-turn-label">
          {n} · {label}
        </h3>
        {note && <span className="tx-turn-note">{note}</span>}
        {busy && <span className="tx-spin" aria-hidden="true" />}
      </div>

      {!ready && blockedBy && (
        <div className="tx-waiting" id={hintId}>
          {blockedBy}
        </div>
      )}
      {doc && <OperationDescription doc={doc} className={DOC_CLASS} />}
      <fieldset disabled={!ready} className="contents">
        {children}
      </fieldset>
    </div>
  );
}

/** A labelled field in the transcript's own vocabulary, with its hint wired to it. */
function TxField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  readOnly?: boolean;
}) {
  const base = useId();
  const id = `${base}-f`;
  const hintId = `${base}-h`;
  return (
    <>
      <label className="tx-field" htmlFor={id}>
        <span className="tx-label">{label}</span>
        <input
          id={id}
          className="tx-input"
          value={value}
          readOnly={readOnly}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          placeholder={placeholder}
          /**
           * The hint is wired, which `ParSection` does and the other thirteen adopters do not.
           * `tx-hint` on its own is a paragraph a sighted reader sees and a screen reader never
           * associates with the field — and this field's hint is the one that says which button it
           * enables, so losing the association would lose the precondition.
           */
          aria-describedby={hint ? hintId : undefined}
        />
      </label>
      {hint && (
        <p className="tx-hint" id={hintId}>
          {hint}
        </p>
      )}
    </>
  );
}

/**
 * The authorization URL, as evidence rather than a link.
 *
 * Three DESIGN.md rules were broken by the previous treatment, a bare `<p className="text-accent-text
 * break-all font-mono">`: Signal Indigo is for what can be acted on and this is a string to read, the
 * Code Wells spec asks for a copy affordance, and `break-all` split inside `http`. It also had no way
 * to take the URL anywhere, while the copy above it called this "the artifact this step exists to
 * show". `tx-datum-value` is mono, ink-coloured and already breaks long values; the copy button is
 * the part the world had no equivalent for.
 */
function AuthUrlEvidence({ url, onAuthorize }: { url: string; onAuthorize: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="tx-evidence tx-lands" data-outcome="issued">
      <div className="tx-evidence-head">
        <span className="tx-evidence-verdict">Authorization URL built</span>
        <span className="tx-turn-note">S256 · state bound</span>
      </div>
      <span className="tx-datum">
        <span className="tx-datum-key">authorization_url</span>
        <span className="tx-datum-value">{url}</span>
      </span>
      <div className="tx-actions">
        <button type="button" className="tx-btn tx-btn-primary" onClick={onAuthorize}>
          Authorize in this tab
        </button>
        <button
          type="button"
          className="tx-btn"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy URL'}
        </button>
      </div>
    </div>
  );
}

/**
 * The six turns of the MCP flow, and nothing else.
 *
 * All of the sequencing lives in `use-mcp-flow.ts`; this file decides only what a step looks like and
 * when it is available — because "can this step be attempted" is a rendering question, and **gating a
 * step on the response object rather than on the field it is about to use** is how the FAPI wizard
 * came to have an enabled button that did nothing.
 *
 * Each response now renders inside the turn that produced it. They used to stack after step 6, so a
 * UserInfo response sat 600px below the button that fetched it — the same defect this file's
 * `StepError` docblock records fixing for *failures*, which was never applied to successes.
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
    <>
      <header className="tx-masthead">
        <h2 className="tx-title">The full flow</h2>
        <span className="tx-ref">six exchanges, in order</span>
      </header>
      <p className="tx-standfirst">
        Discover the authorization server, register a client or skip it, authorize with PKCE and a
        resource indicator, then exchange the code and read what the token carries.
      </p>

      <div className="tx-body">
        <FlowDiagram {...wizardProgress(flow)} steps={MCP_STEPS} className="mb-4" />

        {/* ── 1 · Discover ─────────────────────────────── */}
        <StepTurn
          id="mcp-step-1"
          n={1}
          label="Discover AS"
          note="GET /.well-known/oauth-authorization-server"
          ready
          landed={Boolean(flow.asData)}
          busy={flow.loading === 'Discover AS'}
        >
          <TxField
            label="Issuer URL"
            value={flow.issuer}
            onChange={flow.setIssuer}
            placeholder="http://localhost:3000"
          />
          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={flow.stepDiscover}
              disabled={flow.loading === 'Discover AS'}
            >
              {flow.loading === 'Discover AS' && <span className="tx-spin" aria-hidden="true" />}
              Fetch Metadata
            </button>
          </div>

          {flow.asData && (
            <div
              className="tx-evidence tx-lands"
              data-outcome="issued"
              style={{ marginTop: '1rem' }}
            >
              <div className="tx-evidence-head">
                <span className="tx-evidence-verdict">Metadata read</span>
              </div>
              {flow.asData.issuer && (
                <span className="tx-datum">
                  <span className="tx-datum-key">issuer</span>
                  <span className="tx-datum-value">{String(flow.asData.issuer)}</span>
                </span>
              )}
              {/*
                `resource_indicators_supported` used to be read here and rendered as a badge, and it
                is not a thing. Verified 2026-09-10 against the IANA OAuth Authorization Server
                Metadata registry — no such name is registered; the only resource-related member is
                `protected_resources` (RFC 9728 §4) — and against the MCP authorization specification
                (draft), which never mentions it and says instead: *"MCP clients MUST send this
                parameter regardless of whether authorization servers support it."* There is no
                Authlete service flag for it either; the live service object carries 135 fields and
                none of them is one. So the badge could only ever be absent, and its absence was
                indistinguishable from "we did not check".
              */}
              <span className="tx-datum">
                <span className="tx-datum-key">capabilities</span>
                <span className="tx-datum-value">
                  {[
                    flow.asData.registration_endpoint ? 'DCR Supported' : null,
                    Array.isArray(flow.asData.code_challenge_methods_supported) &&
                    flow.asData.code_challenge_methods_supported.includes('S256')
                      ? 'PKCE S256'
                      : null,
                    flow.asData.authorization_response_iss_parameter_supported
                      ? 'RFC 9207 iss'
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'none advertised'}
                </span>
              </span>
            </div>
          )}
          <StepError flow={flow} steps={['Discover AS']} />
        </StepTurn>

        {/* ── 2 · Register ─────────────────────────────── */}
        <StepTurn
          id="mcp-step-2"
          n={2}
          label="Register client (optional)"
          note="CIMD fetch, or POST /api/client/registration"
          ready={Boolean(flow.asData)}
          landed={flow.clientId !== CLIENT_ID}
          busy={flow.loading === 'Fetch CIMD' || flow.loading === 'DCR Register'}
          blockedBy="Run Step 1 first — this step reads the registration endpoint out of the AS metadata."
        >
          {/* Step 3 gates on the AS metadata and never on this one, so the numbering overstates it:
              the flow runs end to end with the client ID already in the field below. */}
          <p className="tx-hint">
            Optional — Step 3 needs Step 1, not this one. Skip it to authorize with the client ID
            already filled in below.
          </p>
          {/* The field comes before the buttons because it is what turns one of them on. It used to
              sit underneath, so the control and its precondition were in the wrong reading order. */}
          <TxField
            label="CIMD URL (for CIMD flow)"
            value={flow.cimdUrl}
            onChange={flow.setCimdUrl}
            placeholder="https://myapp.com/.well-known/oauth-client"
            hint={
              <>
                An HTTPS URL serving your client&apos;s metadata document. The URL itself becomes
                the <code>client_id</code>, and it is what enables the CIMD button below.
              </>
            }
          />
          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={flow.stepCimd}
              disabled={!flow.cimdUrl || flow.loading === 'Fetch CIMD'}
            >
              {flow.loading === 'Fetch CIMD' && <span className="tx-spin" aria-hidden="true" />}
              CIMD (URL as client_id)
            </button>
            <button
              type="button"
              className="tx-btn"
              onClick={flow.stepDcr}
              disabled={!flow.hasAdminCredential || flow.loading === 'DCR Register'}
            >
              {flow.loading === 'DCR Register' && <span className="tx-spin" aria-hidden="true" />}
              DCR (admin register)
            </button>
          </div>
          {!flow.hasAdminCredential && (
            <p className="tx-hint">
              DCR registration needs the admin credentials at the top of this section.
            </p>
          )}

          {flow.cimdData && (
            <div
              className="tx-evidence tx-lands"
              data-outcome="issued"
              style={{ marginTop: '1rem' }}
            >
              <div className="tx-evidence-head">
                <span className="tx-evidence-verdict">CIMD document read</span>
              </div>
              {flow.cimdData.client_name && (
                <span className="tx-datum">
                  <span className="tx-datum-key">client_name</span>
                  <span className="tx-datum-value">{String(flow.cimdData.client_name)}</span>
                </span>
              )}
              {flow.cimdData.token_endpoint_auth_method && (
                <span className="tx-datum">
                  <span className="tx-datum-key">token_endpoint_auth_method</span>
                  <span className="tx-datum-value">
                    {String(flow.cimdData.token_endpoint_auth_method)}
                  </span>
                </span>
              )}
              {flow.cimdData.scope && (
                <span className="tx-datum">
                  <span className="tx-datum-key">scope</span>
                  <span className="tx-datum-value">{String(flow.cimdData.scope)}</span>
                </span>
              )}
            </div>
          )}
          <TxField
            label="Client ID (auto-filled)"
            value={flow.clientId}
            onChange={flow.setClientId}
            placeholder="client_id or CIMD URL"
          />
          <StepError flow={flow} steps={['Fetch CIMD', 'DCR Register']} />
        </StepTurn>

        {/* ── 3 · Authorize ────────────────────────────── */}
        <StepTurn
          id="mcp-step-3"
          n={3}
          label="Authorize (PKCE + resource)"
          note="front channel — the browser leaves"
          ready={Boolean(flow.asData)}
          landed={Boolean(flow.authUrl)}
          doc={getDoc('mcp', 'authorize-url')}
          blockedBy="Run Step 1 first — the authorization URL is built from the endpoints in the AS metadata."
        >
          <div className="tx-row">
            <TxField label="Redirect URI" value={flow.redirectUri} onChange={flow.setRedirectUri} />
            <TxField label="Scopes" value={flow.scopes} onChange={flow.setScopes} />
          </div>
          <TxField
            label="Resource — the MCP server this token is for"
            value={flow.resource}
            onChange={flow.setResource}
            placeholder="https://mcp-server.example.com"
            hint={
              <>
                Labelled optional here until 2026-09-10, which contradicted the specification this
                section is named for: MCP requires <code>resource</code> on both the authorization
                and the token request, and requires clients to send it{' '}
                <em>regardless of whether the authorization server advertises support</em>. Leave it
                empty and the token comes back without an <code>aud</code> bound to your server —
                Step 6 is where you can see which you got.
              </>
            }
          />
          {!flow.resource && (
            <p className="tx-hint">
              No resource set, so this authorization asks for an unbound token — useful to compare
              against in Step 6, and not what an MCP client should send.
            </p>
          )}
          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={buildAuthUrl}
              disabled={!flow.asData || !flow.clientId}
            >
              Build Authorization URL
            </button>
          </div>

          {flow.authUrl && (
            <div style={{ marginTop: '1rem' }}>
              <p className="tx-hint">
                Authorizing leaves this page and returns to Step 4 with the code already exchanged.
                The URL is here to read first — it is the artifact this step exists to show.
              </p>
              <AuthUrlEvidence url={flow.authUrl} onAuthorize={flow.goAuthorize} />
            </div>
          )}
        </StepTurn>

        {/* ── 4 · Token ────────────────────────────────── */}
        <StepTurn
          id="mcp-step-4"
          n={4}
          label="Token exchange"
          note="POST to the discovered token endpoint"
          ready={Boolean(flow.authUrl)}
          landed={Boolean(flow.tokenResult)}
          busy={flow.loading === 'Exchange Code'}
          doc={getDoc('mcp', 'token-exchange')}
          blockedBy="Build the authorization URL in Step 3 first."
        >
          {/* Step 3 promises the callback exchanges the code, and this step asks you to paste one.
              Both are true — of different legs — and nothing said which you were on. `tokenResult`
              with no code typed here means the redirect leg already did it. */}
          {flow.tokenResult && !flow.code && (
            <p className="tx-hint">
              The callback already exchanged a code for the token below. These fields are for a code
              you obtained some other way — by opening the authorization URL yourself, say.
            </p>
          )}
          <TxField
            label="Authorization Code (from callback)"
            value={flow.code}
            onChange={flow.setCode}
            placeholder="Paste code from ?code=... in callback URL"
          />
          <TxField
            label="Code Verifier (auto-filled)"
            value={flow.codeVerifier}
            onChange={flow.setCodeVerifier}
          />
          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={flow.stepToken}
              disabled={!flow.code || !flow.codeVerifier || flow.loading === 'Exchange Code'}
            >
              {flow.loading === 'Exchange Code' && <span className="tx-spin" aria-hidden="true" />}
              Exchange Code for Token
            </button>
          </div>
          <StepError flow={flow} steps={['Exchange Code']} />
          {flow.tokenResult && (
            <div className="tx-lands" style={{ marginTop: '1rem' }}>
              <JsonBlock data={flow.tokenResult} label="Token Response" />
            </div>
          )}
        </StepTurn>

        {/* ── 5 · UserInfo ─────────────────────────────── */}
        <StepTurn
          id="mcp-step-5"
          n={5}
          label="Fetch UserInfo"
          note="GET the userinfo endpoint, bearer token"
          ready={Boolean(flow.tokenResult)}
          landed={Boolean(flow.userinfoResult)}
          busy={flow.loading === 'Fetch UserInfo'}
          doc={getDoc('mcp', 'userinfo')}
          blockedBy="Exchange a code for an access token in Step 4 first."
        >
          <div className="tx-actions" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={flow.stepUserinfo}
              disabled={!flow.tokenResult || flow.loading === 'Fetch UserInfo'}
            >
              {flow.loading === 'Fetch UserInfo' && <span className="tx-spin" aria-hidden="true" />}
              Fetch UserInfo
            </button>
          </div>
          <StepError flow={flow} steps={['Fetch UserInfo']} />
          {flow.userinfoResult && (
            <div className="tx-lands" style={{ marginTop: '1rem' }}>
              <JsonBlock data={flow.userinfoResult} label="UserInfo Response" />
            </div>
          )}
        </StepTurn>

        {/* ── 6 · Introspect ───────────────────────────── */}
        <StepTurn
          id="mcp-step-6"
          n={6}
          label="Introspect token"
          note="POST the introspection endpoint (RFC 7662)"
          ready={Boolean(flow.tokenResult)}
          landed={Boolean(flow.introspectResult)}
          busy={flow.loading === 'Introspect'}
          doc={getDoc('mcp', 'introspect')}
          blockedBy="Exchange a code for an access token in Step 4 first."
        >
          <p className="tx-hint">
            This is where the resource indicator is proved. Nothing in the metadata advertises RFC
            8707 support — no such member is registered — so the only way to know the audience
            binding worked is to read <code>aud</code> off the token you were issued.
          </p>
          <div className="tx-actions" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={flow.stepIntrospect}
              disabled={!flow.tokenResult || flow.loading === 'Introspect'}
            >
              {flow.loading === 'Introspect' && <span className="tx-spin" aria-hidden="true" />}
              Introspect
            </button>
          </div>
          <StepError flow={flow} steps={['Introspect']} />
          {flow.introspectResult && (
            <div className="tx-lands" style={{ marginTop: '1rem' }}>
              <JsonBlock data={flow.introspectResult} label="Introspection Response" />
            </div>
          )}
        </StepTurn>
      </div>

      {dialog}
    </>
  );
}

export { McpWizard };
