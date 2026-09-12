import { useId, useState } from 'react';
import { useUrlState } from '@/hooks/useUrlState';
import { toast } from 'sonner';
import { mcpService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar, tabPanelProps } from '@/components/ui/TabBar';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { API_BASE_URL } from '@/config';
import { useMcpFlow } from './use-mcp-flow';
import { McpWizard } from './McpWizard';
import '@/styles/transcript.css';

/**
 * MCP — three discovery lookups, then the full flow.
 *
 * **What this replaces.** 661 lines and twenty `useState` calls, fifteen of which belonged to the
 * six-step wizard rather than to anything above it. The wizard's sequencing is `use-mcp-flow.ts` and its
 * rendering is `McpWizard.tsx`; what is left here is the part that is genuinely this section's — three
 * independent metadata lookups that share one result pane.
 *
 * Those three are a table for the same reason `client-operations.ts` is: they were the same six lines
 * three times, differing only in a label, a default and which `mcpService` function to call.
 */

type McpOp = 'discovery' | 'resource-metadata' | 'cimd';

interface Lookup {
  value: McpOp;
  label: string;
  /** The field above the button — each lookup takes exactly one URL. */
  inputLabel: string;
  placeholder: string;
  initial: string;
  buttonLabel: string;
  /** What succeeded, for the toast. */
  success: string;
  /**
   * The path this lookup actually fetches, for the turn's note.
   *
   * A transcript turn names the exchange it performs — that is the information a card never carried.
   * Discovery has two: `fetchAsMetadata` tries RFC 8414's path and falls back to OIDC Discovery's, so
   * the note says the one it asks for first.
   */
  wellKnown: string;
  run: (url: string) => Promise<unknown>;
}

const LOOKUPS: Lookup[] = [
  {
    value: 'discovery',
    wellKnown: '/.well-known/oauth-authorization-server',
    label: 'AS Metadata',
    inputLabel: 'Issuer URL',
    placeholder: 'http://localhost:3000',
    initial: API_BASE_URL,
    buttonLabel: 'Fetch AS Metadata',
    success: 'AS metadata loaded',
    // Tries RFC 8414's well-known path first, then OIDC Discovery's — see `fetchAsMetadata`.
    run: (url) => mcpService.fetchAsMetadata(url),
  },
  {
    value: 'resource-metadata',
    wellKnown: '/.well-known/oauth-protected-resource',
    label: 'Protected Resource',
    inputLabel: 'Resource URL',
    placeholder: 'http://localhost:3000',
    /**
     * `API_BASE_URL`, not a hardcoded `'http://localhost:3000'` literal — matching Discovery's own
     * `initial` above.
     *
     * The hardcoded form defaulted to `localhost:3000` even when this app is the one deployed at
     * `https://oauth2-0-ekh2.onrender.com` — a value meaningless to whoever is looking at that
     * deployment's own page, since it names *their* machine, not the server they are looking at. That
     * pushed a reader to go find "the real URL" some other way, which is exactly how a stale or
     * altogether wrong host (a past Render service name, a typo) ends up pasted in here instead — and
     * this deployment answers *any* unmatched path with its SPA's `index.html`, so the resulting "it
     * returned HTML" report reads as this app's fault rather than as the wrong host. `API_BASE_URL`
     * is this app's own origin, wherever it is actually running.
     */
    initial: API_BASE_URL,
    buttonLabel: 'Fetch Resource Metadata',
    success: 'Protected resource metadata loaded',
    run: (url) => mcpService.fetchProtectedResourceMetadata(url),
  },
  {
    value: 'cimd',
    /* The other two append a well-known path to a base URL; a CIMD document is fetched from the
       `client_id` itself, so the literal request line is the client_id. The explanation this used to
       carry inline — "the document is the client_id" — read as prose after the word GET, and
       `getDoc('mcp', 'cimd')` already says it in full, where a sentence belongs. */
    wellKnown: '{client_id}',
    label: 'CIMD Metadata',
    inputLabel: 'CIMD URL',
    placeholder: 'https://myapp.com/.well-known/oauth-client',
    initial: '',
    buttonLabel: 'Fetch CIMD Metadata',
    success: 'CIMD metadata loaded',
    run: (url) => mcpService.fetchCimdMetadata(url),
  },
];

/** Ties the three tabs to the region they reveal — see `tabPanelProps`. */
const LOOKUP_PANEL_ID = 'mcp-lookup-panel';

/** The tab values, for `useUrlState` to validate `?op=` against rather than trusting it. */
const ALL_OPS: readonly McpOp[] = LOOKUPS.map((l) => l.value);

const INITIAL_URLS: Record<string, string> = Object.fromEntries(
  LOOKUPS.map((l) => [l.value, l.initial]),
);

function McpSection() {
  /**
   * The selected lookup lives in the URL, like the nine other tabbed sections.
   *
   * No fallback: none of the three lookups is the obvious default, and the section reads fine with all
   * three collapsed. `useUrlState` validates the incoming value, so `?op=nonsense` selects nothing rather
   * than asking `getDoc('mcp', …)` for an entry that does not exist.
   */
  const uid = useId();
  const [activeOp, setActiveOp] = useUrlState<McpOp>('op', ALL_OPS);
  const { loading, result, error, call, reset } = useAsyncCall();
  /** One URL per lookup, keyed by operation — they are different addresses, so they are not shared. */
  const [urls, setUrls] = useState<Record<string, string>>(INITIAL_URLS);
  const flow = useMcpFlow();

  const doc = activeOp ? getDoc('mcp', activeOp) : undefined;
  const lookup = LOOKUPS.find((l) => l.value === activeOp);

  const runLookup = async (l: Lookup) => {
    const { data, error: err } = await call(() => l.run(urls[l.value] ?? ''));
    if (data) {
      toast.success(l.success);
    } else {
      toast.error(err);
    }
  };

  return (
    <section className="tx" aria-labelledby={`${uid}-masthead`}>
      {/* `h1`, for the same reason `SectionPanel` used one: this is the title of the page a route
          renders. `SectionPanel` is gone rather than wrapped — `.tx` declares its own palette and
          chrome, and `ParSection` establishes that the two do not nest. */}
      <header className="tx-masthead">
        <h1 className="tx-title" id={`${uid}-masthead`}>
          MCP (Model Context Protocol) OAuth 2.1
        </h1>
        <span className="tx-ref">MCP Authorization · OAuth 2.1 · RFC 8707</span>
      </header>

      <p className="tx-standfirst">
        Two halves, and they answer different questions. The lookups read any server&apos;s metadata
        documents; the flow below runs the whole MCP authorization sequence against this deployment.
      </p>

      {/*
        The first half had no name, and that was the whole of the two-front-doors problem.

        The page opened with a bare tab bar and closed with a masthead reading "The full flow", so one
        entry point was labelled and the other was not — and two of the three lookups run the same
        call as two of the six steps (`fetchAsMetadata` is Step 1; `fetchCimdMetadata` is Step 2's
        CIMD button), which made the unlabelled half look like a duplicate of the labelled one.

        It is not a duplicate, and the standfirst here is the difference: these take **any** origin.
        Verified cross-origin against `accounts.google.com` and `login.microsoftonline.com`, both 200
        — the major providers serve the well-known paths with permissive CORS, so pointing this at
        someone else's authorization server genuinely works. Step 1 walks *this* deployment's flow
        and parses what it reads into a verdict; these hand back the document as it arrived, from
        wherever you point them. Naming both halves is the fix; deleting either would cost a job the
        other cannot do.
      */}
      <header className="tx-masthead">
        <h2 className="tx-title">Read any server&apos;s documents</h2>
        <span className="tx-ref">three well-known lookups</span>
      </header>
      <p className="tx-standfirst">
        Point these at any origin — this deployment, a third-party authorization server, or an MCP
        server of your own — and read the document exactly as it arrived. Nothing here starts a
        flow.
      </p>
      <p className="tx-hint">
        Getting an HTML page back (starting <code>&lt;!doctype html&gt;</code>) instead of JSON
        means the origin you pointed at has no matching route for that well-known path — a wrong
        host, a typo, or a static site with no backend attached — and its own catch-all served its
        homepage instead. It is not this deployment failing; it is a sign to double-check the
        origin. Open
        <code> {'{origin}'}/.well-known/oauth-protected-resource</code> (or the AS metadata path) in
        a plain new browser tab first — a working origin answers with JSON there, before you ever
        paste it in here.
      </p>

      <div className="tx-body">
        {/* The three lookups below share one result pane, so they share one explainer, and it belongs
          here — above the tab bar that owns all three. The wizard's failures used to render here too,
          for want of a way to name the step that produced them; they now render inside that step. See
          `StepError` in `McpWizard.tsx` for what the old placement measured. */}
        {error && <ErrorExplainer error={error} className="mb-3" />}

        <TabBar
          options={LOOKUPS.map(({ value, label }) => ({ value, label }))}
          value={activeOp}
          /**
           * `reset()` first: the three lookups share one `useAsyncCall`, and it clears its result
           * only when the *next* request starts. So fetching AS Metadata and then clicking CIMD
           * Metadata left one server's document under a turn head reading "GET the CIMD URL
           * itself", with a filled marker and `data-dir="in"` — an answer to a request nobody made,
           * which for a wire-inspection instrument is worse than showing nothing.
           */
          onChange={(v) => {
            reset();
            setActiveOp(v);
          }}
          panelId={LOOKUP_PANEL_ID}
        />

        {/* One region for all three lookups, because all three share one result pane — and rendered
          unconditionally, so the `aria-controls` on every tab resolves even with nothing selected.
          Before this the tabs announced as tabs and the content they revealed was related to them by
          nothing a screen reader could hear: the page held zero `role="tabpanel"` elements. */}
        <div
          className="tx-turn"
          data-dir={result ? 'in' : 'out'}
          data-state={activeOp ? undefined : 'pending'}
          {...tabPanelProps(LOOKUP_PANEL_ID, activeOp)}
        >
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            {/* `h3`, one level under the masthead this half now carries — the same relationship
              the wizard's six step turns have to "The full flow". It was a bare `span` first, which
              made heading navigation jump straight past this entire half, then an `h2` because that
              was the only heading here; with a real masthead above it, `h3` is what keeps the
              outline from skipping a level. */}
            <h3 className="tx-turn-label">Metadata · Client → Server</h3>
            {lookup && <span className="tx-turn-note">GET {lookup.wellKnown}</span>}
          </div>

          {activeOp && doc && (
            <OperationDescription
              doc={doc}
              className="tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0"
            />
          )}

          {lookup ? (
            <>
              <label className="tx-field" htmlFor={`${uid}-url`}>
                <span className="tx-label">{lookup.inputLabel}</span>
                <input
                  id={`${uid}-url`}
                  className="tx-input"
                  value={urls[lookup.value] ?? ''}
                  onChange={(e) => setUrls((prev) => ({ ...prev, [lookup.value]: e.target.value }))}
                  placeholder={lookup.placeholder}
                />
              </label>
              <div className="tx-actions">
                <button
                  type="button"
                  className="tx-btn tx-btn-primary"
                  onClick={() => void runLookup(lookup)}
                  disabled={loading}
                >
                  {loading && <span className="tx-spin" aria-hidden="true" />}
                  {lookup.buttonLabel}
                </button>
              </div>
            </>
          ) : (
            /* The empty state the critique measured: three inert chips over 35px of nothing, saying
             neither what these are nor what to do. DESIGN.md: an empty state says what to do next. */
            <div className="tx-waiting">
              Pick a document above. Each is fetched from a well-known path and rendered as it
              arrived — the authorization server&apos;s metadata, an MCP server&apos;s
              protected-resource metadata, or a client&apos;s own CIMD document.
            </div>
          )}

          {result ? <JsonBlock data={result} label="Response" /> : null}
        </div>
      </div>

      <McpWizard flow={flow} />
    </section>
  );
}

export { McpSection };
