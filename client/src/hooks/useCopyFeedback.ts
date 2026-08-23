import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The "Copied" flag, and a timer that does not outlive the component.
 *
 * Four surfaces each wrote `setCopied(true); setTimeout(() => setCopied(false), 2000)` with **no
 * cleanup** — `useClipboard`, `RequestBuilder`, `JsonBlock` and `AuthorizeRequestBuilder`. Navigating
 * away inside that window left a timer holding a reference to an unmounted component's setter. React 19
 * no longer warns about it, which is precisely why it had gone unnoticed in four places.
 *
 * The ref is cleared before each new timer as well as on unmount, so clicking Copy twice in quick
 * succession cannot leave the first timer to switch the label back while the second is still counting.
 */
export function useCopyFeedback(timeout = 2000) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetLater = useCallback(() => {
    clear();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setCopied(false);
    }, timeout);
  }, [clear, timeout]);

  useEffect(() => clear, [clear]);

  return { copied, setCopied, resetLater };
}
