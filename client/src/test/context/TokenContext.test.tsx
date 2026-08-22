import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TokenProvider, useToken } from '@/context/TokenContext';
import { SESSION_KEYS, readKey, writeKey } from '@/services/session-keys';

/**
 * The context decides two things the rest of the app depends on: what the current token is, and whether
 * it must be presented with the `DPoP` scheme. Getting the second wrong is a 401 with a vendor code and
 * no explanation, which is how the app came to produce tokens half of it could not use.
 */

function Probe() {
  const { tokenSet, setTokenSet, clearTokens, getAccessToken, isDpopBound } = useToken();
  return (
    <div>
      <span data-testid="at">{getAccessToken() ?? 'none'}</span>
      <span data-testid="bound">{String(isDpopBound)}</span>
      <span data-testid="scope">{tokenSet?.scope ?? '-'}</span>
      <button onClick={() => setTokenSet({ access_token: 'at-2', token_type: 'DPoP' })}>set</button>
      <button onClick={clearTokens}>clear</button>
    </div>
  );
}

function mount() {
  return render(
    <TokenProvider>
      <Probe />
    </TokenProvider>,
  );
}

beforeEach(() => sessionStorage.clear());
afterEach(() => cleanup());

describe('hydration', () => {
  it('reads an existing token out of session storage', () => {
    writeKey(SESSION_KEYS.tokenResponse, JSON.stringify({ access_token: 'at-1', scope: 'openid' }));
    mount();
    expect(screen.getByTestId('at')).toHaveTextContent('at-1');
    expect(screen.getByTestId('scope')).toHaveTextContent('openid');
  });

  it('survives a corrupted entry instead of failing to boot', () => {
    writeKey(SESSION_KEYS.tokenResponse, 'not json at all');
    expect(() => mount()).not.toThrow();
    expect(screen.getByTestId('at')).toHaveTextContent('none');
  });
});

describe('isDpopBound', () => {
  it('is false for a bearer token', () => {
    writeKey(
      SESSION_KEYS.tokenResponse,
      JSON.stringify({ access_token: 'a', token_type: 'Bearer' }),
    );
    mount();
    expect(screen.getByTestId('bound')).toHaveTextContent('false');
  });

  it('is true for a DPoP token', () => {
    writeKey(SESSION_KEYS.tokenResponse, JSON.stringify({ access_token: 'a', token_type: 'DPoP' }));
    mount();
    expect(screen.getByTestId('bound')).toHaveTextContent('true');
  });

  it('compares case-insensitively, as RFC 9110 §11.1 makes an auth scheme', () => {
    writeKey(SESSION_KEYS.tokenResponse, JSON.stringify({ access_token: 'a', token_type: 'dpop' }));
    mount();
    expect(screen.getByTestId('bound')).toHaveTextContent('true');
  });

  it('is false when token_type is absent rather than guessing', () => {
    writeKey(SESSION_KEYS.tokenResponse, JSON.stringify({ access_token: 'a' }));
    mount();
    expect(screen.getByTestId('bound')).toHaveTextContent('false');
  });
});

describe('setTokenSet', () => {
  it('persists and updates the bound flag together', () => {
    mount();
    expect(screen.getByTestId('bound')).toHaveTextContent('false');
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('at')).toHaveTextContent('at-2');
    expect(screen.getByTestId('bound')).toHaveTextContent('true');
    expect(readKey(SESSION_KEYS.tokenResponse)).toContain('at-2');
  });
});

describe('clearTokens', () => {
  it('clears the whole session, not three keys of thirteen', () => {
    // The defect: `fapi_signing_private_key` survived a clear, and the callback branches on it — so
    // every later code exchange silently switched to private_key_jwt with no way to undo it.
    for (const key of Object.values(SESSION_KEYS)) writeKey(key, 'x');
    writeKey(SESSION_KEYS.tokenResponse, JSON.stringify({ access_token: 'at-1' }));

    mount();
    fireEvent.click(screen.getByText('clear'));

    expect(screen.getByTestId('at')).toHaveTextContent('none');
    for (const key of Object.values(SESSION_KEYS)) {
      expect(readKey(key), key).toBeNull();
    }
  });
});

describe('useToken outside a provider', () => {
  it('fails loudly rather than returning a silently empty context', () => {
    // Rendering the probe bare would otherwise read `undefined` and report "no token" — a wrong answer
    // that looks like a valid one.
    expect(() => render(<Probe />)).toThrow(/must be used within TokenProvider/);
  });
});
