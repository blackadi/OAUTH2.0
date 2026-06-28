import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClipboard } from '@/hooks/useClipboard';

describe('useClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns copied=false initially', () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.copied).toBe(false);
  });

  it('sets copied=true after copy', async () => {
    const { result } = renderHook(() => useClipboard());
    await act(async () => {
      await result.current.copy('test text');
    });
    expect(result.current.copied).toBe(true);
  });

  it('resets copied after timeout', async () => {
    const { result } = renderHook(() => useClipboard(1000));
    await act(async () => {
      await result.current.copy('test text');
    });
    expect(result.current.copied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.copied).toBe(false);
  });

  it('calls navigator.clipboard.writeText with text', async () => {
    const { result } = renderHook(() => useClipboard());
    await act(async () => {
      await result.current.copy('hello world');
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world');
  });

  it('handles clipboard error gracefully', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    const { result } = renderHook(() => useClipboard());
    await act(async () => {
      await result.current.copy('test');
    });
    expect(result.current.copied).toBe(false);
  });
});
