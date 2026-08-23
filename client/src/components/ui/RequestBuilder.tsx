import { cn } from '@/utils/cn';
import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import { toCurl } from '@/utils/curl';

interface RequestBuilderProps {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  className?: string;
}

const methodColors: Record<string, string> = {
  GET: 'text-success-text',
  POST: 'text-info-text',
  PUT: 'text-warning-text',
  PATCH: 'text-warning-text',
  DELETE: 'text-danger-text',
};

function RequestBuilder({ method, url, headers, body, className }: RequestBuilderProps) {
  const { copied, setCopied, resetLater } = useCopyFeedback();
  const [reveal, setReveal] = useState(false);

  // Shared with the request trace's copy button, so the two cannot disagree about quoting or about
  // what counts as a secret. This used to build the command inline: it embedded the real
  // `Authorization: Basic` header — leaking the client secret into anything the command was pasted
  // into — and wrapped the body in single quotes with no escaping, so any apostrophe in a value
  // produced a broken command. Redacted by default now; `Reveal` opts in.
  const copyAsCurl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        toCurl({ method, url, headers, body }, { revealSecrets: reveal }),
      );
      setCopied(true);
      resetLater();
    } catch {
      /* clipboard unavailable */
    }
  }, [method, url, headers, body, reveal, setCopied, resetLater]);

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 overflow-hidden">
          <span
            className={cn(
              'text-2xs font-bold uppercase tracking-wider shrink-0',
              methodColors[method] || 'text-muted-foreground',
            )}
          >
            {method}
          </span>
          <span className="text-xs font-mono text-muted-foreground truncate">{url}</span>
        </div>
        <button
          onClick={copyAsCurl}
          className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none shrink-0 ml-2"
          aria-label="Copy as cURL"
        >
          {copied ? <Check className="h-3 w-3 text-success-text" /> : <Copy className="h-3 w-3" />}
          <span className={copied ? 'text-success-text' : ''}>
            {copied ? 'Copied' : reveal ? 'cURL + secrets' : 'cURL'}
          </span>
        </button>
        {/*
          This control decides whether **real client secrets** land on the clipboard, and it used to be
          labelled `reveal` / `redacted?` — one ambiguous word, and a question mark that reads as a
          question rather than a state or an action. For a security-relevant toggle the label has to say
          what is currently true, so the two states are now named as states and the pressed one is
          marked for assistive technology as well as coloured.
        */}
        <button
          onClick={() => setReveal((r) => !r)}
          aria-pressed={reveal}
          className={cn(
            'text-2xs transition-colors cursor-pointer bg-transparent border-none shrink-0 ml-2',
            reveal
              ? 'text-warning-text font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
          title={
            reveal
              ? 'Secrets are included in the copied command. Click to redact them.'
              : 'Secrets are redacted in the copied command. Click to include them.'
          }
        >
          {reveal ? 'secrets: shown' : 'secrets: hidden'}
        </button>
      </div>
      {headers && Object.keys(headers).length > 0 && (
        <div className="px-3 py-2 border-b border-border space-y-0.5">
          {Object.entries(headers).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs font-mono">
              <span className="text-accent-text shrink-0">{k}:</span>
              <span className="text-muted-foreground truncate">{v}</span>
            </div>
          ))}
        </div>
      )}
      {body && (
        <pre className="px-3 py-2 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all max-h-32 bg-code/50">
          {body}
        </pre>
      )}
    </div>
  );
}

export { RequestBuilder };
