import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { SESSION_KEYS, readKey, writeKey, resetSession } from '@/services/session-keys';
import type { IssuedTokens } from '@/types';

/**
 * One name for one shape.
 *
 * This used to redeclare the same six fields that `types/token.ts` already had, which made `TokenSet`
 * and `TokenResponse` mutually unassignable over an index signature neither the vault nor any renderer
 * cares about. `IssuedTokens` is that shape, declared once.
 */
export type TokenSet = IssuedTokens;

interface TokenContextValue {
  tokenSet: TokenSet | null;
  setTokenSet: (tokens: TokenSet) => void;
  clearTokens: () => void;
  getAccessToken: () => string | undefined;
  /**
   * The scheme this access token must be presented with at a protected resource.
   *
   * RFC 9449 §7.1 gives a sender-constrained token no alternative: it travels under the `DPoP` scheme
   * with a proof, and §7.2 requires the resource server to refuse it as a bearer token. Authlete
   * enforces that — `[A089311]` at UserInfo, `[A281305]` at `/gm` — so every protected-resource call
   * has to know which kind of token it holds. It used to assume `Bearer` everywhere, which meant the
   * headline flow produced a token that half the app could not use.
   */
  isDpopBound: boolean;
}

const TokenContext = createContext<TokenContextValue | null>(null);

export function TokenProvider({ children }: { children: ReactNode }) {
  const [tokenSet, setTokenSetState] = useState<TokenSet | null>(() => {
    const stored = readKey(SESSION_KEYS.tokenResponse);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as TokenSet;
    } catch {
      // A corrupted entry should not stop the app booting.
      return null;
    }
  });

  const setTokenSet = useCallback((tokens: TokenSet) => {
    setTokenSetState(tokens);
    writeKey(SESSION_KEYS.tokenResponse, JSON.stringify(tokens));
  }, []);

  /**
   * Clears the *whole* session, not three keys of twelve.
   *
   * The old version left `fapi_signing_private_key` behind, and the callback branches on it — so once
   * the FAPI section had run, every later code exchange silently switched to `private_key_jwt` with no
   * way to undo it. See `session-keys.ts`.
   */
  const clearTokens = useCallback(() => {
    setTokenSetState(null);
    resetSession();
  }, []);

  const getAccessToken = useCallback(() => {
    return tokenSet?.access_token;
  }, [tokenSet]);

  // `token_type` is compared case-insensitively: RFC 9110 §11.1 makes an auth scheme
  // case-insensitive, and Authlete answers `DPoP` while some servers answer `dpop`.
  const isDpopBound = (tokenSet?.token_type ?? '').toLowerCase() === 'dpop';

  /**
   * Memoised, like `CredentialContext`'s.
   *
   * A fresh object literal every render makes every consumer re-render whenever this provider does, and
   * this provider wraps the entire application. The impact is nil *today* — its only state is
   * `tokenSet`, so a re-render already means the value changed — which is exactly why it is worth
   * fixing now: the next piece of state added here would make it a real problem, silently, and the
   * sibling context already does it the other way.
   */
  const value = useMemo(
    () => ({ tokenSet, setTokenSet, clearTokens, getAccessToken, isDpopBound }),
    [tokenSet, setTokenSet, clearTokens, getAccessToken, isDpopBound],
  );

  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

export function useToken(): TokenContextValue {
  const ctx = useContext(TokenContext);
  if (!ctx) throw new Error('useToken must be used within TokenProvider');
  return ctx;
}
