import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { RequestBuilder } from '@/components/ui/RequestBuilder';

/**
 * `RequestBuilder` had no dedicated test at all — it was only ever rendered incidentally by sections
 * that use it (`TokenRequestPanel`, `TokenExchangeSection`, …), none of which ever clicked its own two
 * controls. That left the one genuinely security-relevant part of this component — whether a real
 * client secret lands on the clipboard — completely unexercised.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const REQUEST = {
  method: 'POST',
  url: 'http://localhost:3000/api/token',
  headers: {
    Authorization: 'Basic dXNlcjpzZWNyZXQ=',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials&client_secret=super-secret-value',
};

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

describe('what it shows', () => {
  it('renders the method, url, headers and body', () => {
    render(<RequestBuilder {...REQUEST} />);
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText(REQUEST.url)).toBeInTheDocument();
    expect(screen.getByText(/Authorization:/)).toBeInTheDocument();
    expect(screen.getByText(/grant_type=client_credentials/)).toBeInTheDocument();
  });

  it('renders nothing for headers or body when neither is given', () => {
    render(<RequestBuilder method="GET" url="http://localhost:3000/api/health" />);
    expect(screen.queryByText(/Authorization/)).toBeNull();
  });
});

describe('copy as cURL', () => {
  it('copies a REDACTED command by default — no real secret reaches the clipboard', async () => {
    const writeText = mockClipboard();
    render(<RequestBuilder {...REQUEST} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy as cURL' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).not.toContain('dXNlcjpzZWNyZXQ=');
    expect(copied).not.toContain('super-secret-value');
    expect(copied).toContain('●●●●●●');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('reveals real secrets only after the toggle is switched on', async () => {
    const writeText = mockClipboard();
    render(<RequestBuilder {...REQUEST} />);

    const toggle = screen.getByRole('button', { name: /secrets: hidden/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /secrets: shown/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    expect(screen.getByText('cURL + secrets')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy as cURL' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('dXNlcjpzZWNyZXQ=');
    expect(copied).toContain('super-secret-value');
  });

  it('does not crash and reports nothing copied when the clipboard is unavailable', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<RequestBuilder {...REQUEST} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy as cURL' }));

    // Give the rejected promise a tick, then confirm the failure was swallowed rather than thrown.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Copied')).toBeNull();
  });
});
