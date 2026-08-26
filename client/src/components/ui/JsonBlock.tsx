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
      {/*
        `key={formatted}` is the reveal, and it is doing real work rather than being decorative.

        A CSS animation runs on mount, so without the key a *second* run of the same operation would
        update the text in place with no cue at all — which is the exact case the audit named: "a new
        response appears instantly with no cue drawing the eye". Keying on the serialised payload
        remounts this node whenever the response actually changed, and leaves it alone when a sibling's
        hover state caused the render. An identical response twice deliberately does **not** re-animate:
        nothing changed, so there is nothing to point at.
      */}
      <pre
        key={formatted}
        className="animate-reveal bg-code p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap break-all border border-border"
      >
        {formatted}
      </pre>
    </div>
  );
}

export { JsonBlock };
