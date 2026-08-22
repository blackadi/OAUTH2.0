import { useState, useMemo, useCallback } from 'react';
import {
  X, Trash2, Copy, Check, ChevronRight, ChevronDown, Eye, EyeOff, Download, Activity,
} from 'lucide-react';
import { useTraces } from '@/hooks/useTraces';
import {
  clearTraces, redactHeaders, redactBody, type TraceEntry,
} from '@/services/trace-store';
import { toCurl } from '@/utils/curl';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { SequenceView } from './SequenceView';
import { cn } from '@/utils/cn';

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
  if (entry.status === 0) return 'bg-slate-500/15 text-foreground-muted border-border/30';
  if (entry.status >= 500) return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (entry.status === 429) return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  if (entry.status >= 400) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (entry.status >= 300) return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
}

const METHOD_TONE: Record<string, string> = {
  GET: 'text-emerald-400',
  POST: 'text-sky-400',
  PUT: 'text-orange-400',
  PATCH: 'text-amber-400',
  DELETE: 'text-red-400',
};

/**
 * Headers worth pulling to the surface, because each one answers a question a user is about to ask.
 * `www-authenticate` carries the step-up and DPoP challenges (RFC 9470, RFC 9449 §7–§9),
 * `dpop-nonce` carries the value that must be replayed, `retry-after` distinguishes a rate limit from
 * a rejection.
 */
const NOTABLE_RESPONSE_HEADERS = ['www-authenticate', 'dpop-nonce', 'retry-after', 'location'];

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
    return <p className="text-[0.7rem] text-muted-foreground italic">none captured</p>;
  }
  return (
    <div className="space-y-0.5">
      {names.map((name) => (
        <div key={name} className="flex gap-2 text-[0.7rem] font-mono">
          <span className="text-indigo-400 shrink-0">{name}:</span>
          <span className="text-muted-foreground break-all">{headers[name]}</span>
        </div>
      ))}
    </div>
  );
}

function TraceRow({ entry, forceOpen }: { entry: TraceEntry; forceOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(forceOpen));
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

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
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — nothing useful to say about it here */
    }
  }, [entry, reveal]);

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
            'text-[0.65rem] font-bold font-mono w-12 shrink-0',
            METHOD_TONE[entry.method.toUpperCase()] ?? 'text-muted-foreground',
          )}
        >
          {entry.method}
        </span>
        <span
          className={cn(
            'text-[0.65rem] font-mono px-1.5 py-0.5 rounded border shrink-0 w-11 text-center tabular-nums',
            statusTone(entry),
          )}
        >
          {entry.status === 0 ? 'ERR' : entry.status}
        </span>
        <span className="text-xs font-mono text-foreground truncate flex-1">
          {shortPath(entry.url)}
        </span>
        {entry.label && (
          <span className="hidden md:inline text-[0.65rem] text-muted-foreground truncate max-w-[14rem]">
            {entry.label}
          </span>
        )}
        {notable.length > 0 && (
          <span className="hidden lg:inline text-[0.6rem] font-mono text-amber-300/90 shrink-0">
            {notable[0]}
          </span>
        )}
        <span className="text-[0.65rem] font-mono text-muted-foreground shrink-0 tabular-nums w-14 text-right">
          {Math.round(entry.durationMs)} ms
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 bg-code/40">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyCurl}
              className="flex items-center gap-1 text-[0.65rem] px-2 py-1 rounded bg-muted/50 text-muted-foreground hover:text-foreground border-none cursor-pointer transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : reveal ? 'cURL (with secrets)' : 'cURL (redacted)'}
            </button>
            <button
              onClick={() => setReveal((r) => !r)}
              className="flex items-center gap-1 text-[0.65rem] px-2 py-1 rounded bg-muted/50 text-muted-foreground hover:text-foreground border-none cursor-pointer transition-colors"
            >
              {reveal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {reveal ? 'Hide secrets' : 'Reveal secrets'}
            </button>
            <span className="text-[0.65rem] text-muted-foreground font-mono">
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
            <div className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5">
              <p className="text-[0.7rem] text-red-300">
                No response received: {entry.networkError}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="space-y-2 min-w-0">
              <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Request
              </p>
              <HeaderTable headers={requestHeaders} />
              {requestBody && (
                <pre className="text-[0.7rem] font-mono text-muted-foreground bg-code/60 border border-border/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                  {requestBody}
                </pre>
              )}
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Response
              </p>
              <HeaderTable headers={entry.responseHeaders} />
              <JsonBlock
                data={entry.responseBody}
                className="[&_pre]:text-[0.7rem] [&_pre]:p-2 [&_pre]:max-h-40 [&_pre]:overflow-auto"
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
    for (const [k, v] of Object.entries(redactHeaders(entry.requestHeaders))) lines.push(`${k}: ${v}`);
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
}

function TracePanel({ open, onClose }: TracePanelProps) {
  const traces = useTraces();
  const [filter, setFilter] = useState('');
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [exported, setExported] = useState(false);
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
      setTimeout(() => setExported(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [visible]);

  if (!open) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-2xl flex flex-col"
      style={{ height: 'min(52vh, 30rem)' }}
      role="region"
      aria-label="Request trace"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap">
        <Activity className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
        <span className="text-xs font-semibold text-foreground shrink-0">Request Trace</span>
        <span className="text-[0.65rem] text-muted-foreground font-mono tabular-nums shrink-0">
          {visible.length}
          {visible.length !== traces.length ? ` / ${traces.length}` : ''}
        </span>

        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by path, method, status…"
          aria-label="Filter requests"
          className="ml-2 flex-1 min-w-[8rem] h-7 rounded-md border border-border bg-input px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                'text-[0.65rem] px-2 py-1 rounded border cursor-pointer transition-colors capitalize',
                view === v
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
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
            'text-[0.65rem] px-2 py-1 rounded border cursor-pointer transition-colors shrink-0',
            failuresOnly
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground',
          )}
        >
          Failures only
        </button>
        <button
          onClick={exportMarkdown}
          disabled={visible.length === 0}
          className="flex items-center gap-1 text-[0.65rem] px-2 py-1 rounded bg-muted/40 text-muted-foreground hover:text-foreground border-none cursor-pointer disabled:opacity-40 shrink-0"
        >
          {exported ? <Check className="h-3 w-3 text-green-400" /> : <Download className="h-3 w-3" />}
          {exported ? 'Copied' : 'Export'}
        </button>
        <button
          onClick={clearTraces}
          disabled={traces.length === 0}
          className="flex items-center gap-1 text-[0.65rem] px-2 py-1 rounded bg-muted/40 text-muted-foreground hover:text-red-400 border-none cursor-pointer disabled:opacity-40 shrink-0"
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </button>
        <button
          onClick={onClose}
          aria-label="Close request trace"
          className="p-1 rounded text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
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
