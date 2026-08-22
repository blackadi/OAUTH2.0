import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TracePanel, toMarkdown } from '@/components/trace/TracePanel';
import { recordTrace, clearTraces, type TraceInput } from '@/services/trace-store';

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
