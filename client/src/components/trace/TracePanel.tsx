import { useState, useMemo, useCallback } from 'react';
import {
  X,
  Trash2,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Download,
  Upload,
  Activity,
  FileDown,
  Info,
} from 'lucide-react';
import { useTraces } from '@/hooks/useTraces';
import {
  clearTraces,
  importTraces,
  redactHeaders,
  redactBody,
  type TraceEntry,
} from '@/services/trace-store';
import { parseRunFile, serializeRunFile, RunFileError } from '@/services/run-file';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import { toCurl } from '@/utils/curl';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { SequenceView } from './SequenceView';
import { cn } from '@/utils/cn';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';

/**
 * The request history — every call this app has made, newest first, with the status, the headers and
 * the timing that the transport layer used to throw away.
 *
 * This is the answer to the single biggest gap against oauthdebugger.com and oauth.tools: previously
 * each section kept only its own latest response in local state, a route change unmounted it, and no
 * status code reached the screen at all. Debugging a four-step protocol meant the evidence of step one
 * was gone by step three.
 */

/** Status classes carry meaning here, so they get colour — and it is separate from the indigo accent. */
function statusTone(entry: TraceEntry): string {
  // A front-channel hop shares `status: 0` with a network failure and means the opposite of it: nothing
  // went wrong, the browser simply received the answer instead of this app. It gets the accent, and the
  // badge below reads NAV rather than ERR.
  if (entry.navigation) return 'bg-tint-accent-strong text-accent-text border-edge-accent';
  // Neutral, not one of the five semantic roles: nothing succeeded and nothing was refused. `muted`
  // is the existing token for a neutral surface and it is already defined per palette.
  if (entry.status === 0) return 'bg-muted text-foreground-muted border-border/30';
  if (entry.status >= 500) return 'bg-tint-danger-strong text-danger-text border-edge-danger';
  if (entry.status === 429) return 'bg-tint-warning-strong text-warning-text border-edge-warning';
  if (entry.status >= 400) return 'bg-tint-warning-strong text-warning-text border-edge-warning';
  if (entry.status >= 300) return 'bg-tint-info-strong text-info-text border-edge-info';
  return 'bg-tint-success-strong text-success-text border-edge-success';
}

const METHOD_TONE: Record<string, string> = {
  GET: 'text-success-text',
  POST: 'text-info-text',
  PUT: 'text-warning-text',
  PATCH: 'text-warning-text',
  DELETE: 'text-danger-text',
};

/**
 * Headers worth pulling to the surface, because each one answers a question a user is about to ask.
 * `www-authenticate` carries the step-up and DPoP challenges (RFC 9470, RFC 9449 §7–§9),
 * `dpop-nonce` carries the value that must be replayed, `retry-after` distinguishes a rate limit from
 * a rejection.
 */
const NOTABLE_RESPONSE_HEADERS = ['www-authenticate', 'dpop-nonce', 'retry-after', 'location'];

/**
 * Visible from `32rem` of container width, in the accessibility tree always.
 *
 * `sr-only` rather than `hidden`, because `display: none` takes the text out of the accessibility tree
 * too — the button would then have no accessible name at all, and the fix for that (an `aria-label` on
 * each) is a second copy of every name, free to drift from the one on screen.
 */
const ACTION_LABEL = 'sr-only @[32rem]:not-sr-only';

function shortPath(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname + (parsed.search ? parsed.search : '');
  } catch {
    return url;
  }
}

function HeaderTable({ headers }: { headers: Record<string, string> }) {
  const names = Object.keys(headers);
  if (names.length === 0) {
    return <p className="text-xs text-muted-foreground italic">none captured</p>;
  }
  return (
    <div className="space-y-0.5">
      {names.map((name) => (
        <div key={name} className="flex gap-2 text-xs font-mono">
          <span className="text-accent-text shrink-0">{name}:</span>
          <span className="text-muted-foreground break-all">{headers[name]}</span>
        </div>
      ))}
    </div>
  );
}

function TraceRow({ entry, forceOpen }: { entry: TraceEntry; forceOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(forceOpen));
  const [reveal, setReveal] = useState(false);
  const { copied, setCopied, resetLater } = useCopyFeedback();

  const requestHeaders = reveal ? entry.requestHeaders : redactHeaders(entry.requestHeaders);
  const requestBody = reveal ? entry.requestBody : redactBody(entry.requestBody);

  const notable = NOTABLE_RESPONSE_HEADERS.filter((h) => entry.responseHeaders[h]);

  const copyCurl = useCallback(async () => {
    const command = toCurl(
      {
        method: entry.method,
        url: entry.url,
        headers: entry.requestHeaders,
        body: entry.requestBody,
      },
      { revealSecrets: reveal },
    );
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      resetLater();
    } catch {
      /* clipboard unavailable — nothing useful to say about it here */
    }
  }, [entry, reveal, setCopied, resetLater]);

  return (
    <div className="border-b border-border/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left bg-transparent border-none cursor-pointer hover:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span
          className={cn(
            'text-2xs font-bold font-mono w-12 shrink-0',
            METHOD_TONE[entry.method.toUpperCase()] ?? 'text-muted-foreground',
          )}
        >
          {entry.method}
        </span>
        <span
          className={cn(
            'text-2xs font-mono px-1.5 py-0.5 rounded border shrink-0 w-11 text-center tabular-nums',
            statusTone(entry),
          )}
        >
          {entry.navigation ? 'NAV' : entry.status === 0 ? 'ERR' : entry.status}
        </span>
        {/*
          Every imported row says so, on the row.

          A banner alone would be a mode you can scroll away from — and a trace panel showing somebody
          else's requests as though they were yours is the one failure of this feature that costs real
          time. `title` carries the same thing for a pointer; the row's own `aria-label` further down
          carries it for a screen reader.
        */}
        {entry.imported && (
          <span
            title="Loaded from a saved run — this build did not send it"
            className="text-2xs font-mono px-1 py-0.5 rounded border border-edge-info bg-tint-info text-info-text shrink-0"
          >
            saved
          </span>
        )}
        <span className="text-xs font-mono text-foreground truncate flex-1">
          {shortPath(entry.url)}
        </span>
        {entry.label && (
          <span className="hidden md:inline text-2xs text-muted-foreground truncate max-w-[14rem]">
            {entry.label}
          </span>
        )}
        {notable.length > 0 && (
          <span className="hidden lg:inline text-2xs font-mono text-warning-text shrink-0">
            {notable[0]}
          </span>
        )}
        <span className="text-2xs font-mono text-muted-foreground shrink-0 tabular-nums w-14 text-right">
          {/* Nothing was awaited on a navigation, so "0 ms" would be a measurement nobody took. */}
          {entry.navigation ? '—' : `${Math.round(entry.durationMs)} ms`}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 bg-code/40">
          <div className="flex flex-wrap items-center gap-2">
            {/* A front-channel hop is a browser navigation, not a request this app can reissue — a cURL
                command for it would fetch the authorization page as a document and teach the wrong
                thing. The URL is above and copyable; that is the reproducible part. */}
            {entry.navigation ? (
              <span className="text-2xs text-muted-foreground italic">
                Front-channel navigation — no request to replay. Paste the URL above into a browser
                to repeat it.
              </span>
            ) : (
              <>
                <button
                  onClick={copyCurl}
                  className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-muted/50 text-muted-foreground hover:text-foreground border-none cursor-pointer transition-colors"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-success-text" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copied ? 'Copied' : reveal ? 'cURL (with secrets)' : 'cURL (redacted)'}
                </button>
                <button
                  onClick={() => setReveal((r) => !r)}
                  className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-muted/50 text-muted-foreground hover:text-foreground border-none cursor-pointer transition-colors"
                >
                  {reveal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {reveal ? 'Hide secrets' : 'Reveal secrets'}
                </button>
              </>
            )}
            <span className="text-2xs text-muted-foreground font-mono">
              {new Date(entry.startedAt).toLocaleTimeString()}
              {entry.statusText ? ` · ${entry.statusText}` : ''}
            </span>
          </div>

          {!entry.ok && !entry.networkError && (
            <ErrorExplainer
              error={
                typeof entry.responseBody === 'string'
                  ? entry.responseBody
                  : JSON.stringify(entry.responseBody)
              }
              status={entry.status}
            />
          )}

          {entry.networkError && (
            <div className="rounded border border-edge-danger bg-tint-danger px-2 py-1.5">
              <p className="text-xs text-danger-text">No response received: {entry.networkError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="space-y-2 min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                Request
              </p>
              <HeaderTable headers={requestHeaders} />
              {requestBody && (
                <pre className="text-xs font-mono text-muted-foreground bg-code/60 border border-border/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                  {requestBody}
                </pre>
              )}
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                Response
              </p>
              <HeaderTable headers={entry.responseHeaders} />
              <JsonBlock
                data={entry.responseBody}
                className="[&_pre]:text-xs [&_pre]:p-2 [&_pre]:max-h-40 [&_pre]:overflow-auto"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Markdown rather than HAR, for now.
 *
 * The stated use is "hand somebody a whole failing flow" — a question in a chat or an issue — and
 * Markdown pastes readably into all of those, where a HAR file is an attachment that needs a tool to
 * open. Secrets are redacted unconditionally on export: unlike the panel, an exported document travels,
 * and there is no per-entry reveal decision to honour once it has left.
 */
function toMarkdown(entries: TraceEntry[]): string {
  const lines = [
    '# OAuth debugger request trace',
    '',
    `${entries.length} request${entries.length === 1 ? '' : 's'}, newest first. Credentials redacted.`,
    '',
  ];
  for (const entry of entries) {
    lines.push(`## ${entry.method} ${shortPath(entry.url)} → ${entry.status || 'network error'}`);
    lines.push('');
    if (entry.label) lines.push(`- **What:** ${entry.label}`);
    lines.push(`- **URL:** \`${entry.url}\``);
    lines.push(`- **Duration:** ${Math.round(entry.durationMs)} ms`);
    if (entry.networkError) lines.push(`- **Network error:** ${entry.networkError}`);
    lines.push('');
    lines.push('**Request headers**');
    lines.push('```');
    for (const [k, v] of Object.entries(redactHeaders(entry.requestHeaders)))
      lines.push(`${k}: ${v}`);
    lines.push('```');
    const body = redactBody(entry.requestBody);
    if (body) {
      lines.push('**Request body**');
      lines.push('```');
      lines.push(body);
      lines.push('```');
    }
    lines.push('**Response headers**');
    lines.push('```');
    for (const [k, v] of Object.entries(entry.responseHeaders)) lines.push(`${k}: ${v}`);
    lines.push('```');
    lines.push('**Response body**');
    lines.push('```json');
    lines.push(
      typeof entry.responseBody === 'string'
        ? entry.responseBody
        : JSON.stringify(entry.responseBody, null, 2),
    );
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

interface TracePanelProps {
  open: boolean;
  onClose: () => void;
  /**
   * Where this is being rendered, which changes the frame and nothing else.
   *
   * `drawer` is the original: `position: fixed` across the bottom of the window, with its own title and
   * close button. `pane` fills the evidence rail, which already supplies both — so those two pieces of
   * chrome come off, and the container stops positioning itself. Everything below the toolbar is
   * identical in both, deliberately: the filter, the timeline/sequence switch, the export pair and the
   * import confirmation are the panel, and a second implementation of them would be a second set of
   * bugs.
   *
   * **Exactly one instance is mounted at a time** — `AppLayout` chooses by viewport through
   * `useMediaQuery`, rather than rendering both and hiding one. Two would put two `role="region"`
   * landmarks with the same accessible name in the tree and split the filter state between them.
   */
  variant?: 'drawer' | 'pane';
}

function TracePanel({ open, onClose, variant = 'drawer' }: TracePanelProps) {
  const isDrawer = variant === 'drawer';
  const traces = useTraces();
  const [filter, setFilter] = useState('');
  const [failuresOnly, setFailuresOnly] = useState(false);
  const { copied: exported, setCopied: setExported, resetLater: resetExported } = useCopyFeedback();
  const [view, setView] = useState<'timeline' | 'sequence'>('timeline');
  /**
   * Which request the sequence view sent us to.
   *
   * Clicking an arrow switches to the timeline and opens that row — the connection between the diagram
   * and the real traffic is the whole point, and a diagram you cannot click through is just a picture.
   */
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return traces.filter((entry) => {
      if (failuresOnly && entry.ok) return false;
      if (!needle) return true;
      return (
        entry.url.toLowerCase().includes(needle) ||
        entry.method.toLowerCase().includes(needle) ||
        String(entry.status).includes(needle) ||
        (entry.label ?? '').toLowerCase().includes(needle)
      );
    });
  }, [traces, filter, failuresOnly]);

  const exportMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(visible));
      setExported(true);
      resetExported();
    } catch {
      /* clipboard unavailable */
    }
  }, [visible, setExported, resetExported]);

  /**
   * Save the run as a file, so somebody can open it here rather than only read it.
   *
   * The Markdown export copies to the clipboard because its destination is a chat or an issue. A run
   * file's destination is this tool, on someone else's machine, so it is a file — and `visible` rather
   * than `traces`, matching Markdown: if you filtered to the four failing requests, those four are the
   * run you meant to hand over.
   */
  const saveRunFile = useCallback(() => {
    const text = serializeRunFile(visible, new Date());
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `oauth-run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    link.click();
    // Without this the blob is held for the lifetime of the document. `click()` on a detached anchor is
    // synchronous enough that the download has already been queued by the time this runs.
    URL.revokeObjectURL(url);
  }, [visible]);

  /**
   * The file waiting on a confirmation, because importing **replaces** the current trace.
   *
   * Held as parsed entries rather than as the `File`, so the dialog only ever appears for a file that is
   * actually readable — being asked "discard your trace?" and then told the file was malformed is the
   * wrong order to learn those two things in.
   */
  const [pendingImport, setPendingImport] = useState<{
    entries: Parameters<typeof importTraces>[0];
    name: string;
  } | null>(null);

  const readRunFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const { entries } = parseRunFile(await file.text());
        if (entries.length === 0) {
          toast.error('That run file has no requests in it.');
          return;
        }
        // Nothing to discard, so nothing to confirm.
        if (traces.length === 0) {
          importTraces(entries);
          toast.success(`Loaded ${entries.length} request${entries.length === 1 ? '' : 's'}`);
          return;
        }
        setPendingImport({ entries, name: file.name });
      } catch (e) {
        // `RunFileError`'s message is written to be shown; anything else is a surprise and says so.
        toast.error(e instanceof RunFileError ? e.message : 'That file could not be read.');
      }
    },
    [traces.length],
  );

  const viewingImported = traces.length > 0 && traces.every((t) => t.imported);
  const mixedImported = !viewingImported && traces.some((t) => t.imported);

  if (!open) return null;

  return (
    <div
      className={cn(
        'flex flex-col bg-card',
        isDrawer
          ? 'fixed bottom-0 left-0 right-0 z-50 border-t border-border shadow-2xl'
          : /* The rail owns the width, the height and the left border. */ 'h-full min-h-0',
      )}
      style={isDrawer ? { height: 'min(52vh, 30rem)' } : undefined}
      role="region"
      aria-label="Request trace"
    >
      {/*
        The toolbar reduces its own labels to icons when its container is narrow — **progressive
        reduction**, not progressive disclosure.

        Nine controls in a 380px rail wrapped to three rows, which is a third of the pane's height spent
        on chrome before a single request is shown. The usual reach is an overflow menu, and it is the
        wrong tool here: four of these are one-click primitives, one of them is *Clear*, and burying a
        destructive action one level deeper than the three benign ones beside it is how it gets pressed by
        accident. Dropping the labels keeps every control one click away, at 28px each, which is what a
        dense utility toolbar does.

        The query is on the **container**, not the viewport, so the same component is correct in a 380px
        rail, a rail the reader has dragged to 640px, and the full-width bottom sheet — the lesson
        `SplitPane` already carries. Labels return at `32rem`, which is the first width where the four of
        them plus the filter and the view switch fit on two rows.
      */}
      <div className="@container border-b border-border shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
          {/* In the rail the tab already says "Trace", and repeating it costs a line of a 380px column. */}
          {isDrawer && (
            <>
              <Activity className="h-3.5 w-3.5 text-accent-text shrink-0" />
              <span className="text-xs font-semibold text-foreground shrink-0">Request Trace</span>
            </>
          )}
          {/* In the rail the tab already reads `Trace · 12`, so an unfiltered count here is a bare number
            with nothing to attach it to. Once a filter narrows the list, `3 / 12` is the only place that
            says so, and it earns its space. */}
          {(isDrawer || visible.length !== traces.length) && (
            <span className="text-2xs text-muted-foreground font-mono tabular-nums shrink-0">
              {visible.length}
              {visible.length !== traces.length ? ` / ${traces.length}` : ''}
            </span>
          )}

          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by path, method, status…"
            aria-label="Filter requests"
            /* `basis-40` with `flex-1`: the filter takes 10rem as its starting size and grows into whatever
             row 1 has left, which makes the wrap point predictable instead of a function of the
             placeholder's intrinsic width. */
            className={cn(
              'flex-1 basis-40 min-w-0 h-7 rounded-md border border-border bg-input px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
              isDrawer && 'ml-2',
            )}
          />

          {/* Two views of the same capture: a list, and the conversation it describes. */}
          <div className="flex gap-0.5 shrink-0" role="tablist" aria-label="Trace view">
            {(['timeline', 'sequence'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'text-2xs px-2 py-1 rounded border cursor-pointer transition-colors capitalize',
                  view === v
                    ? 'bg-tint-accent-strong text-accent-text border-edge-accent'
                    : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFailuresOnly((f) => !f)}
            className={cn(
              'text-2xs px-2 py-1 rounded border cursor-pointer transition-colors shrink-0',
              failuresOnly
                ? 'bg-tint-warning-strong text-warning-text border-edge-warning'
                : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground',
            )}
          >
            Failures only
          </button>
          {/* One cluster, so the four of them wrap together and stay right-aligned on whichever row they
            land on. `ACTION_LABEL` is `sr-only` below the threshold rather than `hidden`: the text stays
            in the accessibility tree, so these keep their accessible names without a second copy of each
            name in an `aria-label` that could drift from the visible one. */}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button
              onClick={exportMarkdown}
              disabled={visible.length === 0}
              title="Copy these requests as Markdown, for a chat or an issue"
              className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-muted/40 text-muted-foreground hover:text-foreground border-none cursor-pointer disabled:opacity-40 shrink-0"
            >
              {exported ? (
                <Check className="h-3 w-3 text-success-text" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              <span className={ACTION_LABEL}>{exported ? 'Copied' : 'Export'}</span>
            </button>
            {/* Two exports with two destinations: Markdown to the clipboard for a chat or an issue, a run
            file to disk for somebody to open here. See `services/run-file.ts` on why not one. */}
            <button
              onClick={saveRunFile}
              disabled={visible.length === 0}
              title="Save these requests as a file somebody can open in this tool"
              className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-muted/40 text-muted-foreground hover:text-foreground border-none cursor-pointer disabled:opacity-40 shrink-0"
            >
              <FileDown className="h-3 w-3" />
              <span className={ACTION_LABEL}>Save run</span>
            </button>
            <label
              title="Open a saved run — this replaces the requests shown here"
              className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-muted/40 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
            >
              <Upload className="h-3 w-3" />
              <span className={ACTION_LABEL}>Open run</span>
              {/*
            A real `<input type="file">` inside the label rather than a button that clicks a hidden one.
            The label makes the whole control the file picker's trigger, keyboard included, and
            `sr-only` keeps the input in the accessibility tree — `display: none` would take it out of
            it, which is how a file picker becomes unreachable without a pointer.
          */}
              <input
                type="file"
                accept="application/json,.json"
                aria-label="Open a saved run"
                className="sr-only"
                onChange={(e) => {
                  void readRunFile(e.target.files?.[0]);
                  // Cleared so choosing the *same* file twice fires `change` the second time too.
                  e.target.value = '';
                }}
              />
            </label>
            <button
              onClick={clearTraces}
              disabled={traces.length === 0}
              title="Discard the requests shown here — they are held in memory only"
              className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-muted/40 text-muted-foreground hover:text-danger-text border-none cursor-pointer disabled:opacity-40 shrink-0"
            >
              <Trash2 className="h-3 w-3" />
              <span className={ACTION_LABEL}>Clear</span>
            </button>
          </div>
          {/* The rail has one close control for all three of its tabs; a second one here would be two
            controls for one action, and the wrong one would be the nearer. */}
          {isDrawer && (
            <button
              onClick={onClose}
              aria-label="Close request trace"
              className="p-1 rounded text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/*
        The banner is the second of two signals, not the only one — every imported row is marked too.

        A banner alone is a mode you can scroll past; a row marker alone is easy to read as decoration.
        Together they answer the question at whichever moment it gets asked. `role="status"` rather than
        `alert`: this is a standing condition, not an event, so it should be available on demand and not
        interrupt whatever a screen reader is in the middle of.
      */}
      {(viewingImported || mixedImported) && (
        <div
          role="status"
          className="flex items-start gap-2 px-3 py-2 border-b border-edge-info bg-tint-info shrink-0"
        >
          <Info className="h-3.5 w-3.5 text-info-text mt-0.5 shrink-0" />
          <p className="text-2xs text-info-text leading-relaxed m-0">
            {viewingImported ? (
              <>
                <strong>You are looking at a saved run.</strong> These requests were recorded
                somewhere else — this build did not send them, and the credentials in them were
                redacted on export. Clear the trace to go back to your own traffic.
              </>
            ) : (
              <>
                <strong>This trace mixes a saved run with your own requests.</strong> The rows
                marked <span className="font-mono">saved</span> came from a file; the rest are live.
              </>
            )}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={pendingImport !== null}
        title="Open this saved run?"
        body={`Loading ${pendingImport?.name ?? 'this file'} replaces the ${traces.length} request${traces.length === 1 ? '' : 's'} currently in the trace. They are held in memory only, so this cannot be undone.`}
        confirmLabel="Replace the trace"
        onConfirm={() => {
          if (!pendingImport) return;
          const count = pendingImport.entries.length;
          importTraces(pendingImport.entries);
          setPendingImport(null);
          toast.success(`Loaded ${count} request${count === 1 ? '' : 's'} from a saved run`);
        }}
        onCancel={() => setPendingImport(null)}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {view === 'sequence' ? (
          <SequenceView
            traces={visible}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setView('timeline');
            }}
          />
        ) : visible.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            {traces.length === 0
              ? 'No requests yet. Run an operation and every call will appear here.'
              : 'No requests match this filter.'}
          </p>
        ) : (
          visible.map((entry) => (
            <TraceRow
              // The key carries the selection, so a row that is already mounted remounts when it
              // becomes the selected one — `forceOpen` is an initial state, and without this it would
              // only work for rows that happened not to be on screen yet.
              key={`${entry.id}:${entry.id === selectedId}`}
              entry={entry}
              forceOpen={entry.id === selectedId}
            />
          ))
        )}
      </div>
    </div>
  );
}

export { TracePanel, toMarkdown };
