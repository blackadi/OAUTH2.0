import { cn } from '@/utils/cn';
import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import { toCurl } from '@/utils/curl';

interface RequestBuilderProps {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  className?: string;
}

const methodColors: Record<string, string> = {
  GET: 'text-green-400',
  POST: 'text-blue-400',
  PUT: 'text-orange-400',
  PATCH: 'text-yellow-400',
  DELETE: 'text-red-400',
};

function RequestBuilder({ method, url, headers, body, className }: RequestBuilderProps) {
  const [copied, setCopied] = useState(false);
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
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }, [method, url, headers, body, reveal]);

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={cn(
            'text-[0.65rem] font-bold uppercase tracking-wider shrink-0',
            methodColors[method] || 'text-muted-foreground',
          )}>
            {method}
          </span>
          <span className="text-xs font-mono text-muted-foreground truncate">{url}</span>
        </div>
        <button
          onClick={copyAsCurl}
          className="flex items-center gap-1 text-[0.65rem] text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none shrink-0 ml-2"
          aria-label="Copy as cURL"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          <span className={copied ? 'text-green-400' : ''}>
            {copied ? 'Copied' : reveal ? 'cURL + secrets' : 'cURL'}
          </span>
        </button>
        <button
          onClick={() => setReveal((r) => !r)}
          className="text-[0.65rem] text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none shrink-0 ml-2"
          title={reveal ? 'Redact credentials in the copied command' : 'Include real credentials in the copied command'}
        >
          {reveal ? 'redacted?' : 'reveal'}
        </button>
      </div>
      {headers && Object.keys(headers).length > 0 && (
        <div className="px-3 py-2 border-b border-border space-y-0.5">
          {Object.entries(headers).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[0.7rem] font-mono">
              <span className="text-indigo-400 shrink-0">{k}:</span>
              <span className="text-muted-foreground truncate">{v}</span>
            </div>
          ))}
        </div>
      )}
      {body && (
        <pre className="px-3 py-2 text-[0.7rem] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all max-h-32 bg-code/50">
          {body}
        </pre>
      )}
    </div>
  );
}

export { RequestBuilder };
