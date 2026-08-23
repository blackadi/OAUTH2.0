import { render, screen, act, cleanup } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LiveAnnouncer } from '@/components/ui/LiveAnnouncer';
import { announce, resetAnnouncements } from '@/services/announcer';
import { useAsyncCall, useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';

beforeEach(() => {
  resetAnnouncements();
});
afterEach(cleanup);

describe('LiveAnnouncer', () => {
  /**
   * The single most common way live regions are got wrong: mounting the region and filling it in the
   * same commit. A screen reader only announces a change to a region that was already in the
   * accessibility tree, so both regions have to exist from first paint, empty.
   */
  it('mounts both regions empty, before there is anything to say', () => {
    render(<LiveAnnouncer />);
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');

    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(status).toHaveTextContent('');
    expect(alert).toHaveTextContent('');
  });

  it('sends a polite message to the status region only', () => {
    render(<LiveAnnouncer />);
    act(() => announce('Request succeeded. The response is in the results panel.', 'polite'));

    expect(screen.getByRole('status')).toHaveTextContent('Request succeeded.');
    expect(screen.getByRole('alert')).toHaveTextContent('');
  });

  it('sends an assertive message to the alert region only', () => {
    render(<LiveAnnouncer />);
    act(() => announce('Request failed. 401 Unauthorized', 'assertive'));

    expect(screen.getByRole('alert')).toHaveTextContent('401 Unauthorized');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('keeps both regions in the tree while switching between them', () => {
    render(<LiveAnnouncer />);
    act(() => announce('ok', 'polite'));
    act(() => announce('bad', 'assertive'));

    // Neither region is unmounted when the other is in use — that would break the next announcement.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('bad');
  });
});

/**
 * The wiring, not just the plumbing.
 *
 * `useAsyncCall` is the one place all 20 sections share, which is why the announcement belongs there —
 * and why these two cases are the ones that prove every section gained the behaviour.
 */
describe('useAsyncCall announces its outcome', () => {
  it('announces politely on success and assertively on failure', async () => {
    render(<LiveAnnouncer />);
    const { result } = renderHook(() => useAsyncCall<string>());

    await act(async () => {
      await result.current.call(async () => 'fine');
    });
    expect(screen.getByRole('status')).toHaveTextContent(/Request succeeded/i);

    await act(async () => {
      await result.current.call(async () => {
        throw new Error('boom');
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Request failed.*boom/i);
  });

  it('labels the announcement with the operation for the discriminated hook', async () => {
    render(<LiveAnnouncer />);
    const { result } = renderHook(() => useDiscriminatedAsyncCall<'introspect'>());

    await act(async () => {
      await result.current.call('introspect', async () => ({ active: true }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(/introspect succeeded/i);
  });

  /**
   * A 9,837-byte HTML error page is a realistic response on this deployment — an unknown `/api` path
   * used to fall through to the SPA catch-all. Reading all of it aloud is worse than saying nothing, so
   * the spoken form is capped while the rendered form keeps everything.
   */
  it('truncates a very long failure rather than reading a page aloud', async () => {
    render(<LiveAnnouncer />);
    const { result } = renderHook(() => useAsyncCall<string>());
    const huge = 'x'.repeat(5000);

    await act(async () => {
      await result.current.call(async () => {
        throw new Error(huge);
      });
    });

    const spoken = screen.getByRole('alert').textContent ?? '';
    expect(spoken.length).toBeLessThan(400);
    expect(spoken).toContain('…');
  });
});

describe('the announcer does not throw when nothing is listening', () => {
  it('tolerates an announcement with no region mounted', () => {
    expect(() => announce('nobody is listening', 'polite')).not.toThrow();
  });

  it('does not warn about a missing region', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    announce('quiet', 'assertive');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
