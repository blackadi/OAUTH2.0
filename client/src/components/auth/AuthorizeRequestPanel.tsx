import { useState, useCallback } from 'react';
import { Copy, Check, Send, AlertTriangle, ExternalLink } from 'lucide-react';
import { type AuthParamSpec } from '@/data/authParams';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import type { AuthorizeSendContext } from './use-authorize-params';

/**
 * The request itself: the URL, the escape hatch, the warnings, and the button that leaves.
 *
 * **Raw mode is this panel's state, and the send is paired with it here for that reason.** `builtUrl`
 * comes from the parameter table; `rawUrl` is a hand-edit of it; `effectiveUrl` is whichever is in play
 * — and *that* is the string sent. Computing the URL in one file and deciding which URL to send in
 * another is precisely how a preview drifts from a request, which is the defect this whole component
 * replaced.
 */

interface AuthorizeRequestPanelProps {
  /** The URL derived from the parameter table — the preview, and the default thing to send. */
  builtUrl: string;
  enabledCount: number;
  jsonProblems: AuthParamSpec[];
  challengeEdited: boolean;
  /** `request_uri` is enabled *and* carries a value, so the pushed-request note applies. */
  requestUriActive: boolean;
  /** Read at the moment of the send, not at render — see the note on it in `use-authorize-params.ts`. */
  sendContext: () => AuthorizeSendContext;
  onSend: (url: string, context: AuthorizeSendContext) => void;
}

function AuthorizeRequestPanel({
  builtUrl,
  enabledCount,
  jsonProblems,
  challengeEdited,
  requestUriActive,
  sendContext,
  onSend,
}: AuthorizeRequestPanelProps) {
  const [rawMode, setRawMode] = useState(false);
  const [rawUrl, setRawUrl] = useState('');
  const { copied, setCopied, resetLater } = useCopyFeedback();
  const effectiveUrl = rawMode ? rawUrl : builtUrl;

  // Entering raw mode seeds the box from the built URL, so it is an edit of the real request rather
  // than a blank page.
  const toggleRaw = useCallback(() => {
    setRawMode((was) => {
      if (!was) setRawUrl(builtUrl);
      return !was;
    });
  }, [builtUrl]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(effectiveUrl);
      setCopied(true);
      resetLater();
    } catch {
      /* clipboard unavailable */
    }
  }, [effectiveUrl, setCopied, resetLater]);

  const send = useCallback(() => {
    onSend(effectiveUrl, sendContext());
  }, [effectiveUrl, onSend, sendContext]);

  return (
    <div className="rounded-lg border border-edge-accent bg-tint-accent overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-edge-accent flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-bold uppercase tracking-wider text-success-text">GET</span>
          <span className="text-xs font-semibold text-foreground">Authorization request</span>
          <span className="text-2xs font-mono text-muted-foreground tabular-nums">
            {enabledCount} param{enabledCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleRaw}
            className={cn(
              'text-2xs px-2 py-1 rounded border cursor-pointer transition-colors',
              rawMode
                ? 'bg-tint-warning-strong text-warning-text border-edge-warning'
                : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground',
            )}
          >
            {rawMode ? 'Editing raw URL' : 'Edit raw'}
          </button>
          <button
            onClick={copyUrl}
            className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-muted/40 text-muted-foreground hover:text-foreground border-none cursor-pointer"
          >
            {copied ? (
              <Check className="h-3 w-3 text-success-text" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? 'Copied' : 'Copy URL'}
          </button>
        </div>
      </div>

      {rawMode ? (
        <textarea
          value={rawUrl}
          onChange={(e) => setRawUrl(e.target.value)}
          aria-label="Raw authorization URL"
          rows={5}
          className="w-full bg-code/60 px-3 py-2 text-xs font-mono text-foreground border-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring resize-y"
        />
      ) : (
        // `tabIndex={0}` and a name, because this block scrolls. A scrollable region that cannot
        // receive focus cannot be scrolled by keyboard at all — content below the fold is simply
        // unreachable without a pointer. Found by axe (`scrollable-region-focusable`); the
        // `role="region"` plus `aria-label` is what keeps it from being an unnamed focus stop.
        <pre
          tabIndex={0}
          role="region"
          aria-label="Authorization request URL"
          className="px-3 py-2 text-xs font-mono text-accent-text whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-code/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
        >
          {builtUrl}
        </pre>
      )}

      <div className="px-3 py-2 space-y-2 border-t border-edge-accent">
        {challengeEdited && (
          <Warning>
            <code>code_challenge</code> was edited by hand, so it no longer matches the verifier
            this page holds. The redirect will work and the <em>token exchange</em> will fail —
            which is exactly what PKCE is for. Regenerate to pair them again.
          </Warning>
        )}
        {jsonProblems.length > 0 && (
          <Warning>
            {jsonProblems.map((p) => p.name).join(', ')} is not valid JSON. Sending it anyway is
            fine — the server&apos;s complaint is worth reading — but it will not be accepted.
          </Warning>
        )}
        {requestUriActive && (
          <Warning tone="info">
            With <code>request_uri</code> the other parameters travel inside the pushed request. RFC
            9126 expects <code>client_id</code> alongside it and little else — turn the rest off to
            see the canonical shape.
          </Warning>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={send} className="w-full sm:w-auto">
            <Send className="h-4 w-4 mr-2" />
            Send authorization request
          </Button>
          <a
            href={effectiveUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Open in a new tab
          </a>
        </div>
        <p className="text-2xs text-muted-foreground">
          Sending navigates this tab to the URL above. The PKCE verifier and <code>state</code> are
          stored first, so the callback can complete the exchange and check the response.
        </p>
      </div>
    </div>
  );
}

function Warning({
  children,
  tone = 'warn',
}: {
  children: React.ReactNode;
  tone?: 'warn' | 'info';
}) {
  return (
    <div
      className={cn(
        'flex gap-2 items-start rounded px-2 py-1.5 border',
        tone === 'warn' ? 'bg-tint-warning border-edge-warning' : 'bg-tint-info border-edge-info',
      )}
    >
      <AlertTriangle
        className={cn(
          'h-3.5 w-3.5 mt-0.5 shrink-0',
          tone === 'warn' ? 'text-warning-text' : 'text-info-text',
        )}
      />
      <p
        className={cn(
          'text-xs leading-relaxed',
          tone === 'warn' ? 'text-warning-text' : 'text-info-text',
        )}
      >
        {children}
      </p>
    </div>
  );
}

export { AuthorizeRequestPanel };
