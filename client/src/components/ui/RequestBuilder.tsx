import { cn } from '@/utils/cn';
import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';

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

  const copyAsCurl = useCallback(async () => {
    const parts = [`curl -X ${method}`];
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        parts.push(`  -H "${k}: ${v}"`);
      }
    }
    if (body) {
      parts.push(`  -d '${body}'`);
    }
    parts.push(`  '${url}'`);
    try {
      await navigator.clipboard.writeText(parts.join(' \\\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [method, url, headers, body]);

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
            {copied ? 'Copied' : 'cURL'}
          </span>
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
        <pre className="px-3 py-2 text-[0.7rem] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all max-h-32 bg-slate-950/50">
          {body}
        </pre>
      )}
    </div>
  );
}

export { RequestBuilder };
