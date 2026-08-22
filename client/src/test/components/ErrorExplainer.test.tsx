import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';

afterEach(() => cleanup());

describe('ErrorExplainer', () => {
  it('always shows the raw text, so the explanation can be checked against it', () => {
    const raw = '401 · [A157357] The client identifier is not found at the expected location.';
    render(<ErrorExplainer error={raw} />);
    expect(screen.getByText(raw)).toBeInTheDocument();
  });

  it('explains a repo-verified Authlete code and marks it as verified here', () => {
    render(<ErrorExplainer error='{"error":"invalid_client","error_description":"[A157357] …"}' />);
    expect(screen.getByText('A157357')).toBeInTheDocument();
    expect(screen.getByText(/verified here/i)).toBeInTheDocument();
    // Unique to the cause line; "channel" alone appears in the fix as well.
    expect(
      screen.getByText(/not about their value|not where Authlete expected/i),
    ).toBeInTheDocument();
  });

  it('explains the OAuth code and the vendor code together when both are present', () => {
    render(<ErrorExplainer error='{"error":"invalid_grant","error_description":"[A050317] …"}' />);
    expect(screen.getByText('invalid_grant')).toBeInTheDocument();
    expect(screen.getByText('A050317')).toBeInTheDocument();
  });

  it('says plainly when a code is unrecognised instead of inventing a cause', () => {
    render(<ErrorExplainer error="[A999999] brand new failure" />);
    expect(screen.getByText(/no entry for/i)).toBeInTheDocument();
    expect(screen.getByText(/vendor's own words/i)).toBeInTheDocument();
  });

  it('falls back to a status hint when there is no code at all', () => {
    render(<ErrorExplainer error="Request failed" status={429} />);
    expect(screen.getByText(/Rate limited/i)).toBeInTheDocument();
  });

  it('offers no explanation panel when it has nothing to add', () => {
    render(<ErrorExplainer error="Request failed" status={200} />);
    expect(screen.queryByText(/What does this mean/i)).toBeNull();
    expect(screen.getByText('Request failed')).toBeInTheDocument();
  });

  it('can be collapsed, since a known error does not need re-reading', () => {
    render(<ErrorExplainer error="[A124301] PKCE required" />);
    expect(screen.getByText(/PKCE is required for this client/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Hide explanation/i }));
    expect(screen.getByRole('button', { name: /What does this mean/i })).toBeInTheDocument();
  });

  it('names the spec or the finding behind every explanation', () => {
    render(<ErrorExplainer error="[A089311] Expected a DPoP header but none was provided." />);
    expect(screen.getByText(/RFC 9449 §7.2/)).toBeInTheDocument();
  });

  it('treats a poll-in-progress as information rather than a failure', () => {
    render(<ErrorExplainer error='{"error":"authorization_pending"}' />);
    expect(screen.getByText(/Not an error/i)).toBeInTheDocument();
  });
});

describe('a very long error body (regression)', () => {
  it('truncates the raw preview instead of flooding the panel', () => {
    // This deployment's SPA catch-all answers an unknown /api path with ~9,800 bytes of HTML (F-27),
    // and a 5xx HTML page is the same shape. Every character used to reach the DOM.
    const html = `<!DOCTYPE html><html>${'x'.repeat(9800)}</html>`;
    const { container } = render(<ErrorExplainer error={html} status={500} />);
    expect((container.textContent ?? '').length).toBeLessThan(2000);
    expect(screen.getByRole('button', { name: /Show all 9,828 characters/ })).toBeInTheDocument();
  });

  it('reveals the whole body on request, since seeing what arrived is the point', () => {
    const html = `<!DOCTYPE html><html>${'x'.repeat(9800)}</html>`;
    const { container } = render(<ErrorExplainer error={html} status={500} />);
    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    expect((container.textContent ?? '').length).toBeGreaterThan(9800);
  });

  it('leaves a short error alone', () => {
    render(<ErrorExplainer error="[A124301] PKCE required" />);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});
