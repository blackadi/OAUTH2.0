import { useState, useEffect, useRef } from 'react';
import { HEALTH_ENDPOINT } from '@/config';

export type ServerStatus = 'connected' | 'disconnected' | 'checking';

interface ServerHealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
}

interface UseServerStatusOptions {
  interval?: number;
  timeout?: number;
  retryInterval?: number;
}

interface UseServerStatusReturn {
  status: ServerStatus;
  isOnline: boolean;
  uptime: number | null;
  lastCheck: Date | null;
}

export function useServerStatus(options?: UseServerStatusOptions): UseServerStatusReturn {
  const { interval = 30_000, timeout = 5_000, retryInterval = 10_000 } = options ?? {};
  const [status, setStatus] = useState<ServerStatus>('checking');
  const [uptime, setUptime] = useState<number | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Extracted so the effect depends on the *flip* rather than on every `status` transition — polling should
  // change cadence when connectivity changes, not when 'checking' becomes 'checking' again. It was inlined
  // as `status === 'connected'` in the dependency array, which does the same thing but cannot be checked
  // statically, so `react-hooks/exhaustive-deps` reported both a missing dependency and a complex
  // expression. Same behaviour, now verifiable.
  const isConnected = status === 'connected';

  useEffect(() => {
    mountedRef.current = true;

    const check = async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      const timeoutId = setTimeout(() => abortRef.current?.abort(), timeout);

      try {
        const res = await fetch(HEALTH_ENDPOINT, {
          signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeoutId);

        if (!mountedRef.current) return;

        if (res.ok) {
          const data: ServerHealthResponse = await res.json();
          setUptime(data.uptime);
          setLastCheck(new Date(data.timestamp));
          setStatus('connected');
        } else {
          setStatus('disconnected');
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setStatus('disconnected');
      }
    };

    // Not awaited on purpose: `check` handles its own failures and an effect body cannot be async.
    void check();

    const pollMs = isConnected ? interval : retryInterval;
    /**
     * `void check()`, not `check` — an async function passed straight to `setInterval` returns a promise
     * the timer discards, so any rejection inside it becomes unhandled. `check` catches its own failures
     * today, which is why this never misbehaved; marking the discard makes that a stated decision rather
     * than a property nobody is watching.
     */
    const intervalId = setInterval(() => void check(), pollMs);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearInterval(intervalId);
    };
  }, [isConnected, interval, retryInterval, timeout]);

  return { status, isOnline: isConnected, uptime, lastCheck };
}
