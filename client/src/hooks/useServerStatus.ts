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

    check();

    const pollMs = status === 'connected' ? interval : retryInterval;
    const intervalId = setInterval(check, pollMs);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearInterval(intervalId);
    };
  }, [status === 'connected', interval, retryInterval, timeout]);

  return { status, isOnline: status === 'connected', uptime, lastCheck };
}
