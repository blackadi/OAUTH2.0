import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTheme } from '@/hooks/useTheme';

function mockSystem(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? dark : !dark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  mockSystem(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the three states', () => {
  it('follows the system by default, stamping nothing on the root', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe('system');
    // No attribute means `prefers-color-scheme` decides, which is the point of the default.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('resolves the system preference for labelling', () => {
    mockSystem(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('light');
  });

  it('stamps an explicit choice so it beats the system in both directions', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice('light'));
    // The system says dark here; choosing light must still win.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(result.current.resolved).toBe('light');
  });

  it('cycles system → dark → light → system', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe('system');
    act(() => result.current.cycle());
    expect(result.current.choice).toBe('dark');
    act(() => result.current.cycle());
    expect(result.current.choice).toBe('light');
    act(() => result.current.cycle());
    expect(result.current.choice).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('persistence', () => {
  it('remembers an explicit choice across mounts — a theme that resets is not a preference', () => {
    const first = renderHook(() => useTheme());
    act(() => first.result.current.setChoice('light'));
    cleanup();

    const second = renderHook(() => useTheme());
    expect(second.result.current.choice).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('forgets the choice when returning to system', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice('dark'));
    act(() => result.current.setChoice('system'));
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('ignores a nonsense stored value rather than stamping it', () => {
    localStorage.setItem('theme', 'chartreuse');
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe('system');
  });

  it('still applies a choice when storage throws, as in a sandboxed frame', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = renderHook(() => useTheme());
    expect(() => act(() => result.current.setChoice('light'))).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
