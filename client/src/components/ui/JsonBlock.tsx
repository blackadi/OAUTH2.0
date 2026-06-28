import { cn } from '@/utils/cn';
import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';

interface JsonBlockProps {
  data: unknown;
  className?: string;
  label?: string;
}

function JsonBlock({ data, className, label }: JsonBlockProps) {
  const [copied, setCopied] = useState(false);
  const formatted = JSON.stringify(data, null, 2);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [formatted]);

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
          >
            <span className="relative inline-flex items-center gap-1">
              {copied ? (
                <Check className="h-3 w-3 text-green-400 transition-all duration-200 scale-110" />
              ) : (
                <Copy className="h-3 w-3 transition-all duration-200" />
              )}
              <span className={copied ? 'text-green-400' : ''}>
                {copied ? 'Copied' : 'Copy'}
              </span>
            </span>
          </button>
        </div>
      )}
      <pre className="bg-slate-900 p-4 rounded-lg overflow-x-auto text-[0.8rem] font-mono whitespace-pre-wrap break-all border border-slate-800">{formatted}</pre>
    </div>
  );
}

export { JsonBlock };
