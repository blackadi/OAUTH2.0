import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useServerStatus } from '@/hooks/useServerStatus';

/**
 * The one piece of the app that runs on a timer and talks to the network on its own. It drives the
 * header's connectivity badge, so a wrong answer here tells the user the server is down when it is not —
 * the same class of lie F-28 produced on the server side.
 */

const healthy = {
  ok: true,
  json: async () => ({ status: 'ok', uptime: 42, timestamp: '2026-08-22T00:00:00.000Z' }),
} as Response;

beforeEach(() => vi.useRealTimers());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useServerStatus', () => {
  it('starts as checking rather than guessing', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useServerStatus());
    expect(result.current.status).toBe('checking');
    expect(result.current.isOnline).toBe(false);
  });

  it('reports connected and surfaces the uptime', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(healthy);
    const { result } = renderHook(() => useServerStatus());
    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(result.current.uptime).toBe(42);
    expect(result.current.lastCheck).toBeInstanceOf(Date);
  });

  it('reports disconnected when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useServerStatus());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));
  });

  it('treats a non-2xx as disconnected — a 500 is not a healthy server', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    const { result } = renderHook(() => useServerStatus());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));
  });

  it('does not report a failure when its own abort fires', async () => {
    // The 5s timeout aborts in flight. An AbortError is this hook cancelling itself, not the server
    // being unreachable, and reporting it as "offline" would make the badge flicker on every unmount.
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abort);
    const { result } = renderHook(() => useServerStatus());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.status).toBe('checking');
  });

  it('polls on the interval, and faster while disconnected', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(healthy);
    renderHook(() => useServerStatus({ interval: 30_000, retryInterval: 10_000 }));

    expect(fetchSpy).toHaveBeenCalledTimes(1); // immediately on mount
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it('re-checks immediately when connectivity flips, which changes the cadence', async () => {
    // Measured rather than assumed: mount fires one check, and the transition to `connected` re-runs
    // the effect — deliberately, since a connected server is polled every 30s and an unreachable one
    // every 10s. Pinned because it looks like a duplicate request if you do not know why it happens.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(healthy);
    const { result } = renderHook(() => useServerStatus());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('stops polling once unmounted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(healthy);
    const { result, unmount } = renderHook(() => useServerStatus({ interval: 1_000 }));
    // Let it settle first: snapshotting before the connectivity flip would count that re-check as a
    // post-unmount call and report a leak that is not there.
    await waitFor(() => expect(result.current.status).toBe('connected'));
    const atUnmount = fetchSpy.mock.calls.length;

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fetchSpy.mock.calls.length).toBe(atUnmount);
  });
});
