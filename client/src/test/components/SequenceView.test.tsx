import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SequenceView, laneFor } from '@/components/trace/SequenceView';
import type { TraceEntry } from '@/services/trace-store';

function entry(overrides: Partial<TraceEntry> = {}): TraceEntry {
  return {
    id: 't1',
    startedAt: 1_700_000_000_000,
    durationMs: 12,
    method: 'POST',
    url: 'http://localhost:3000/api/token',
    requestHeaders: {},
    status: 200,
    statusText: 'OK',
    responseHeaders: {},
    responseBody: {},
    ok: true,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('who each request was addressed to', () => {
  it('routes protocol endpoints to the authorization server', () => {
    expect(laneFor(entry({ url: 'http://x/api/token' }))).toBe('as');
    expect(laneFor(entry({ url: 'http://x/api/authorization' }))).toBe('as');
    expect(laneFor(entry({ url: 'http://x/api/par' }))).toBe('as');
  });

  it('routes protected resources to the resource server', () => {
    expect(laneFor(entry({ url: 'http://x/api/userinfo' }))).toBe('rs');
    expect(laneFor(entry({ url: 'http://x/api/gm/grant-1' }))).toBe('rs');
  });

  it('distinguishes /api/token/list from /api/token — the ordering that matters', () => {
    // Most-specific-first: management prefixes are tested before the bare token endpoint, or every
    // admin call would be drawn as a protocol message.
    expect(laneFor(entry({ url: 'http://x/api/token' }))).toBe('as');
    expect(laneFor(entry({ url: 'http://x/api/token/list' }))).toBe('admin');
    expect(laneFor(entry({ url: 'http://x/api/client/list' }))).toBe('admin');
  });
});

describe('SequenceView', () => {
  it('says so when there is nothing to draw', () => {
    render(<SequenceView traces={[]} />);
    expect(screen.getByText(/No requests yet/i)).toBeInTheDocument();
  });

  it('draws one exchange per captured request, oldest first', () => {
    // The store is newest-first; a conversation reads downwards in the order it happened.
    render(
      <SequenceView
        traces={[
          entry({ id: 'b', url: 'http://x/api/userinfo', method: 'GET' }),
          entry({ id: 'a', url: 'http://x/api/token' }),
        ]}
      />,
    );
    // Scoped to `text`: every arrow also has a `<title>` for screen readers, which matches too.
    const labels = screen.getAllByText(/POST token|GET userinfo/, { selector: 'text' });
    expect(labels[0]).toHaveTextContent('POST token');
    expect(labels[1]).toHaveTextContent('GET userinfo');
  });

  it('shows the status and duration of each exchange', () => {
    render(<SequenceView traces={[entry({ status: 401, durationMs: 37 })]} />);
    expect(screen.getByText(/401 · 37 ms/)).toBeInTheDocument();
  });

  it('labels a network failure as one rather than as a status', () => {
    render(<SequenceView traces={[entry({ status: 0, ok: false })]} />);
    expect(screen.getByText(/network error/, { selector: 'text' })).toBeInTheDocument();
  });

  /**
   * The description is on the wrapper, and the SVG carries no `role` — deliberately.
   *
   * This asserted `getByRole('img', …)`, which pinned a real ARIA defect: `role="img"` makes the whole
   * subtree **presentational**, so the `role="button" tabIndex={0}` arrows inside were keyboard-focusable
   * and simultaneously invisible to a screen reader. A user could tab onto an element that announced
   * nothing, which is worse than no ARIA at all.
   */
  it('is described for a screen reader, not only drawn', () => {
    render(<SequenceView traces={[entry()]} />);
    expect(screen.getByRole('group', { name: /Message flow of 1 requests/i })).toBeInTheDocument();
    // The old role must not come back: it is what hid the arrows.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps each arrow announceable, not merely focusable', () => {
    render(<SequenceView traces={[entry()]} onSelect={vi.fn()} />);
    const arrow = screen.getByRole('button');
    expect(arrow).toHaveAttribute('tabindex', '0');
    // The `<title>` is the arrow's accessible name; under `role="img"` on the SVG it was unreachable.
    expect(arrow).toHaveAccessibleName();
  });

  it('clicks through to the request that produced the arrow', () => {
    const onSelect = vi.fn();
    render(<SequenceView traces={[entry({ id: 'trace-9' })]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('trace-9');
  });

  it('is keyboard-operable', () => {
    const onSelect = vi.fn();
    render(<SequenceView traces={[entry({ id: 'trace-9' })]} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('trace-9');
  });
});
