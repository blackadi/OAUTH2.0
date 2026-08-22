import { useCallback } from 'react';
import { useCopyFeedback } from './useCopyFeedback';

/**
 * Copy to the clipboard, with a "Copied" flag that reverts.
 *
 * The timer used to be a bare `setTimeout` with no cleanup, so unmounting inside the two-second window
 * left it holding an unmounted component's setter. `useCopyFeedback` owns the timer and clears it.
 */
export function useClipboard(timeout = 2000) {
  const { copied, setCopied, resetLater } = useCopyFeedback(timeout);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        resetLater();
      } catch {
        // A blocked or unavailable clipboard is not worth an error state — the value is still on screen.
      }
    },
    [setCopied, resetLater],
  );

  return { copied, copy };
}
