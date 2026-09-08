import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';

/**
 * The safety net for every section route — `AppLayout` wraps the routed content in exactly one of
 * these. It had no dedicated test: `sections.smoke.test.tsx` and the driven suites all mount sections
 * that render successfully, so the one code path that matters here — a child actually throwing — had
 * never been exercised. An untested error boundary is a sharper version of the risk this file's own
 * doc comment names for `componentDidCatch`: a lifecycle method that silently stops being called turns
 * every crash into a blank screen, and nothing here would have said so.
 */

afterEach(cleanup);

/** Throws on render when `shouldThrow` is true, so a single component can drive both paths. */
function Bomb({ shouldThrow, message }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) throw new Error(message ?? 'boom');
  return <p>rendered fine</p>;
}

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('rendered fine')).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });

  it('catches a thrown error and renders the fallback with the message', () => {
    // React logs the error to the console in addition to `componentDidCatch`; silence it so the test
    // output isn't a wall of expected noise, and assert on it below rather than ignoring it.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="the vault key is unreadable" />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText('the vault key is unreadable')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('falls back to a generic message when the thrown error has none', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A real `Error` always has a `message` (even if empty), but `getDerivedStateFromError` is typed to
    // accept anything a `throw` can produce — including a value with no `message` at all, which is
    // exactly what `error?.message || '…'` exists to handle.
    function ThrowsNonError(): never {
      throw { notAnError: true };
    }
    render(
      <ErrorBoundary>
        <ThrowsNonError />
      </ErrorBoundary>,
    );
    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
  });

  it('logs the caught error via componentDidCatch, not just to state', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="logged-error-marker" />
      </ErrorBoundary>,
    );

    expect(
      consoleError.mock.calls.some((call) =>
        call.some((arg) => arg instanceof Error && arg.message === 'logged-error-marker'),
      ),
      "componentDidCatch must actually run — a silently-broken lifecycle name is this file's stated risk",
    ).toBe(true);
    consoleError.mockRestore();
  });

  /**
   * "Try again" resets the boundary's own state, not the world — if the child throws unconditionally,
   * retrying re-renders it and it throws again, which is correct: the button offers a retry, not a
   * guarantee. Driven with a child that stops throwing on the second render, the way a transient error
   * (a dropped network call, a stale token read) would actually recover.
   */
  it('"Try again" clears the error and lets a since-fixed child render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('transient');
      return <p>recovered</p>;
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });
});
