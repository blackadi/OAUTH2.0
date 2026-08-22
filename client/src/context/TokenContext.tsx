import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { SESSION_KEYS, readKey, writeKey, resetSession } from "@/services/session-keys";

export interface TokenSet {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

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

  return (
    <TokenContext.Provider
      value={{ tokenSet, setTokenSet, clearTokens, getAccessToken, isDpopBound }}
    >
      {children}
    </TokenContext.Provider>
  );
}

export function useToken(): TokenContextValue {
  const ctx = useContext(TokenContext);
  if (!ctx) throw new Error("useToken must be used within TokenProvider");
  return ctx;
}
