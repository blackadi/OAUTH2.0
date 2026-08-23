import { cn } from '@/utils/cn';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import { Copy, Check } from 'lucide-react';
import { useCallback, useMemo } from 'react';

interface JsonBlockProps {
  data: unknown;
  className?: string;
  label?: string;
}

function JsonBlock({ data, className, label }: JsonBlockProps) {
  const { copied, setCopied, resetLater } = useCopyFeedback();
  /**
   * Memoised: this ran on every render, and the payloads here are not small — the discovery document is
   * 66 members and a client list is unbounded. Re-serialising it because a sibling's hover state changed
   * is work nobody asked for.
   */
  const formatted = useMemo(() => JSON.stringify(data, null, 2), [data]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      // Cleared on unmount by `useCopyFeedback`; a bare `setTimeout` here fired `setCopied` after the
      // component was gone.
      resetLater();
    } catch {
      // ignore
    }
  }, [formatted, setCopied, resetLater]);

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
                <Check className="h-3 w-3 text-success-text transition-all duration-200 scale-110" />
              ) : (
                <Copy className="h-3 w-3 transition-all duration-200" />
              )}
              <span className={copied ? 'text-success-text' : ''}>
                {copied ? 'Copied' : 'Copy'}
              </span>
            </span>
          </button>
        </div>
      )}
      <pre className="bg-code p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap break-all border border-border">
        {formatted}
      </pre>
    </div>
  );
}

export { JsonBlock };
