import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

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
}

const TokenContext = createContext<TokenContextValue | null>(null);

export function TokenProvider({ children }: { children: ReactNode }) {
  const [tokenSet, setTokenSetState] = useState<TokenSet | null>(() => {
    const stored = sessionStorage.getItem("token_response");
    return stored ? JSON.parse(stored) : null;
  });

  const setTokenSet = useCallback((tokens: TokenSet) => {
    setTokenSetState(tokens);
    sessionStorage.setItem("token_response", JSON.stringify(tokens));
  }, []);

  const clearTokens = useCallback(() => {
    setTokenSetState(null);
    sessionStorage.removeItem("token_response");
    sessionStorage.removeItem("pkce_code_verifier");
    sessionStorage.removeItem("oauth_state");
  }, []);

  const getAccessToken = useCallback(() => {
    return tokenSet?.access_token;
  }, [tokenSet]);

  return (
    <TokenContext.Provider value={{ tokenSet, setTokenSet, clearTokens, getAccessToken }}>
      {children}
    </TokenContext.Provider>
  );
}

export function useToken(): TokenContextValue {
  const ctx = useContext(TokenContext);
  if (!ctx) throw new Error("useToken must be used within TokenProvider");
  return ctx;
}
