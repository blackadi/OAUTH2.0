import { useState } from 'react';
import { useUrlState } from '@/hooks/useUrlState';
import { toast } from 'sonner';
import { mcpService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { getDoc } from '@/data/operationDocs';
import { API_BASE_URL } from '@/config';
import { useMcpFlow } from './use-mcp-flow';
import { McpWizard } from './McpWizard';

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
  run: (url: string) => Promise<unknown>;
}

const LOOKUPS: Lookup[] = [
  {
    value: 'discovery',
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
    label: 'Protected Resource',
    inputLabel: 'Resource URL',
    placeholder: 'http://localhost:3000',
    initial: 'http://localhost:3000',
    buttonLabel: 'Fetch Resource Metadata',
    success: 'Protected resource metadata loaded',
    run: (url) => mcpService.fetchProtectedResourceMetadata(url),
  },
  {
    value: 'cimd',
    label: 'CIMD Metadata',
    inputLabel: 'CIMD URL',
    placeholder: 'https://myapp.com/.well-known/oauth-client',
    initial: '',
    buttonLabel: 'Fetch CIMD Metadata',
    success: 'CIMD metadata loaded',
    run: (url) => mcpService.fetchCimdMetadata(url),
  },
];

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
  const [activeOp, setActiveOp] = useUrlState<McpOp>('op', ALL_OPS);
  const { loading, result, error, call } = useAsyncCall();
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
    <SectionPanel
      title="MCP (Model Context Protocol) OAuth 2.1"
      description="Test MCP authorization flows — discovery, CIMD registration, and full PKCE + resource indicator flow"
    >
      <AdminAuth label="Admin (for DCR)" />

      {error && <ErrorExplainer error={error} className="mb-3" />}
      {/* The wizard's failures were a bare `<p>` while the tabs directly above used the explainer — the
          same PED-08 defect closed in JAR and FAPI, still open in one half of this one section. An
          `[A157303]` here means the exchange presented client-authentication data for a public client,
          and `[A157357]` means the credentials arrived on the wrong channel; both have answers written
          down in this repo and neither is guessable from the raw string. */}
      {flow.error && <ErrorExplainer error={String(flow.error)} className="mb-3" />}

      <TabBar
        options={LOOKUPS.map(({ value, label }) => ({ value, label }))}
        value={activeOp}
        onChange={setActiveOp}
      />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {lookup && (
        <div className="space-y-3">
          <Input
            label={lookup.inputLabel}
            value={urls[lookup.value] ?? ''}
            onChange={(e) => setUrls((prev) => ({ ...prev, [lookup.value]: e.target.value }))}
            placeholder={lookup.placeholder}
          />
          <Button onClick={() => void runLookup(lookup)} loading={loading}>
            {lookup.buttonLabel}
          </Button>
        </div>
      )}

      {result ? <JsonBlock data={result} label="Response" /> : null}

      <McpWizard flow={flow} />
    </SectionPanel>
  );
}

export { McpSection };
