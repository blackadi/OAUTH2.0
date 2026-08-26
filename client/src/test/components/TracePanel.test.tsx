import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TracePanel, toMarkdown } from '@/components/trace/TracePanel';
import {
  recordTrace,
  clearTraces,
  importTraces,
  getTraces,
  type TraceInput,
} from '@/services/trace-store';
import { serializeRunFile } from '@/services/run-file';

function entry(overrides: Partial<TraceInput> = {}): TraceInput {
  return {
    startedAt: 1_700_000_000_000,
    durationMs: 42,
    method: 'POST',
    url: 'https://as.example/api/token',
    requestHeaders: { Authorization: 'Basic c2VjcmV0LXZhbHVl' },
    requestBody: 'grant_type=client_credentials&client_secret=s3cr3t',
    status: 200,
    statusText: 'OK',
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: { access_token: 'at-1' },
    ok: true,
    ...overrides,
  };
}

beforeEach(() => clearTraces());
afterEach(() => cleanup());

describe('TracePanel', () => {
  it('renders nothing when closed', () => {
    recordTrace(entry());
    const { container } = render(<TracePanel open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the status code, which is the whole reason it exists', () => {
    recordTrace(entry({ status: 429, statusText: 'Too Many Requests', ok: false }));
    render(<TracePanel open onClose={() => {}} />);
    expect(screen.getByText('429')).toBeInTheDocument();
  });

  it('lists a request with its method, path and duration', () => {
    recordTrace(entry());
    render(<TracePanel open onClose={() => {}} />);
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('/api/token')).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
  });

  it('says so when there is nothing to show', () => {
    render(<TracePanel open onClose={() => {}} />);
    expect(screen.getByText(/No requests yet/i)).toBeInTheDocument();
  });

  it('hides credentials until asked, then reveals them', () => {
    recordTrace(entry());
    render(<TracePanel open onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /\/api\/token/ }));
    expect(screen.getByText(/Basic ●●●●●●/)).toBeInTheDocument();
    expect(screen.queryByText(/c2VjcmV0LXZhbHVl/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Reveal secrets/i }));
    expect(screen.getByText(/Basic c2VjcmV0LXZhbHVl/)).toBeInTheDocument();
  });

  it('surfaces a network failure distinctly from an HTTP status', () => {
    recordTrace(
      entry({ status: 0, ok: false, networkError: 'Failed to fetch', responseHeaders: {} }),
    );
    render(<TracePanel open onClose={() => {}} />);
    expect(screen.getByText('ERR')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /\/api\/token/ }));
    expect(screen.getByText(/No response received: Failed to fetch/)).toBeInTheDocument();
  });

  it('filters to failures only', () => {
    recordTrace(entry({ url: 'https://as.example/api/ok', status: 200, ok: true }));
    recordTrace(entry({ url: 'https://as.example/api/bad', status: 401, ok: false }));
    render(<TracePanel open onClose={() => {}} />);

    expect(screen.getByText('/api/ok')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Failures only/i }));
    expect(screen.queryByText('/api/ok')).toBeNull();
    expect(screen.getByText('/api/bad')).toBeInTheDocument();
  });

  it('filters by free text across path, method and status', () => {
    recordTrace(entry({ url: 'https://as.example/api/par' }));
    recordTrace(entry({ url: 'https://as.example/api/userinfo' }));
    render(<TracePanel open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Filter requests/i), { target: { value: 'userinfo' } });
    expect(screen.getByText('/api/userinfo')).toBeInTheDocument();
    expect(screen.queryByText('/api/par')).toBeNull();
  });

  it('clears the trace', () => {
    recordTrace(entry());
    render(<TracePanel open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
    expect(screen.getByText(/No requests yet/i)).toBeInTheDocument();
  });
});

describe('toMarkdown export', () => {
  it('redacts unconditionally, because an exported document travels', () => {
    const md = toMarkdown([{ id: 't1', ...entry() }]);
    expect(md).not.toContain('c2VjcmV0LXZhbHVl');
    expect(md).not.toContain('s3cr3t');
    expect(md).toContain('Basic ●●●●●●');
  });

  it('includes the status, the timing and both bodies', () => {
    const md = toMarkdown([{ id: 't1', ...entry({ status: 401, ok: false }) }]);
    expect(md).toContain('POST /api/token → 401');
    expect(md).toContain('42 ms');
    expect(md).toContain('access_token');
  });
});

describe('a run leaves as a file and comes back as one', () => {
  /**
   * **The third half of P3-4.** `run-file.test.ts` proves the format round-trips and
   * `trace-store` proves an import replaces and marks. Neither can see whether the panel offers the
   * controls or reads the file — which is the same shape as the four dead flows of 2026-08-22: correct
   * halves, no wiring.
   */
  function runFileOf(...entries: TraceInput[]): File {
    const withIds = entries.map((e, i) => ({ ...e, id: `t${i + 1}` }));
    return new File(
      [serializeRunFile(withIds, new Date('2026-08-23T12:00:00Z'))],
      'shared-run.json',
      {
        type: 'application/json',
      },
    );
  }

  it('offers both exports, and disables them with nothing to export', () => {
    render(<TracePanel open onClose={() => {}} />);
    // Markdown to the clipboard for a chat; a run file to disk for this tool. Two destinations.
    expect(screen.getByRole('button', { name: /^Export$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save run/i })).toBeDisabled();
    // The file picker is never disabled — opening a run is exactly what you do with an empty trace.
    expect(screen.getByLabelText(/Open a saved run/i)).toBeEnabled();
  });

  it('enables them once there is something to hand over', () => {
    recordTrace(entry());
    render(<TracePanel open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /Save run/i })).toBeEnabled();
  });

  /** Nothing to discard, so nothing to confirm — the trace loads straight away. */
  it('loads a run with no confirmation when the trace is empty', async () => {
    render(<TracePanel open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Open a saved run/i), {
      target: { files: [runFileOf(entry({ url: 'https://as.example/api/par' }))] },
    });

    await waitFor(() => expect(getTraces()).toHaveLength(1));
    expect(getTraces()[0].url).toBe('https://as.example/api/par');
    expect(getTraces()[0].imported).toBe(true);
  });

  /**
   * **Confirmation, because importing replaces.** UX-09 found six irreversible actions with none
   * confirmed; this one destroys a trace that is held in memory only and therefore cannot be recovered.
   */
  it('asks before replacing a trace that already has requests in it', async () => {
    recordTrace(entry({ url: 'https://as.example/api/mine' }));
    render(<TracePanel open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Open a saved run/i), {
      target: { files: [runFileOf(entry({ url: 'https://as.example/api/theirs' }))] },
    });

    expect(await screen.findByText(/Open this saved run\?/i)).toBeInTheDocument();
    // Not yet — the trace is untouched until the answer comes back.
    expect(getTraces()[0].url).toBe('https://as.example/api/mine');

    fireEvent.click(screen.getByRole('button', { name: /Replace the trace/i }));
    await waitFor(() => expect(getTraces()[0].url).toBe('https://as.example/api/theirs'));
  });

  it('leaves the trace alone when the confirmation is declined', async () => {
    recordTrace(entry({ url: 'https://as.example/api/mine' }));
    render(<TracePanel open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Open a saved run/i), {
      target: { files: [runFileOf(entry({ url: 'https://as.example/api/theirs' }))] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Cancel/i }));

    expect(getTraces()).toHaveLength(1);
    expect(getTraces()[0].url).toBe('https://as.example/api/mine');
  });

  /**
   * A malformed file must not get as far as the "discard your trace?" question. Being asked to give
   * something up and *then* told the file was unreadable is the wrong order to learn those two things in.
   */
  it('does not ask to replace anything for a file it cannot read', async () => {
    recordTrace(entry());
    render(<TracePanel open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Open a saved run/i), {
      target: { files: [new File(['<html>not a run</html>'], 'oops.json')] },
    });

    await waitFor(() => expect(getTraces()).toHaveLength(1));
    expect(screen.queryByText(/Open this saved run\?/i)).not.toBeInTheDocument();
  });

  /**
   * **The safety property, at the surface.** Two signals, deliberately: a banner is a mode you can
   * scroll past, and a row marker alone reads as decoration.
   */
  it('says on the panel and on the row that these requests are not yours', () => {
    importTraces([entry()]);
    render(<TracePanel open onClose={() => {}} />);

    expect(screen.getByRole('status')).toHaveTextContent(/looking at a saved run/i);
    // By title, not by text: the mixed-trace banner below quotes the word "saved" to explain the marker,
    // so a text query matches the explanation as well as the thing being explained.
    expect(screen.getByTitle(/Loaded from a saved run/i)).toBeInTheDocument();
  });

  it('says something different again when a saved run is mixed with live requests', () => {
    importTraces([entry()]);
    recordTrace(entry({ url: 'https://as.example/api/live' }));
    render(<TracePanel open onClose={() => {}} />);

    expect(screen.getByRole('status')).toHaveTextContent(/mixes a saved run/i);
    // Exactly one row is marked, so the marker distinguishes rather than decorating.
    expect(screen.getAllByTitle(/Loaded from a saved run/i)).toHaveLength(1);
  });

  it('shows no banner at all for a trace that is entirely live', () => {
    recordTrace(entry());
    render(<TracePanel open onClose={() => {}} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Loaded from a saved run/i)).not.toBeInTheDocument();
  });
});
