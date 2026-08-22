import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

/**
 * The deployment's management credentials, entered once.
 *
 * **The problem.** Eight sections each held their own `useState` pair for the same two values, and a
 * route change unmounts a section — so navigating from Token Management to Client Management meant
 * typing them again, and again, and again. Half the app's surface is behind that credential.
 *
 * **Held in memory only, deliberately.** Persisting them to `sessionStorage` would survive navigation
 * *and* survive every other tab-lifetime read of that storage, and these are the credentials that gate
 * every management route on the server (`requireBasicAuth` fails closed without them). A React context
 * lives exactly as long as the page does, which is the right lifetime for something typed by hand: it
 * outlives a route change and does not outlive the tab. `TokenVault` makes the same trade in the other
 * direction for tokens, and says so.
 *
 * Named "profile" rather than "credentials" in the UI because more than one deployment is a real case:
 * a local server and a deployed one need different pairs, and the switch should be one control rather
 * than sixteen fields.
 */

export interface CredentialProfile {
  /** `MGMT_CLIENT_ID` on the server. */
  clientId: string;
  /** `MGMT_CLIENT_SECRET`. */
  clientSecret: string;
}

interface CredentialContextValue extends CredentialProfile {
  setClientId: (value: string) => void;
  setClientSecret: (value: string) => void;
  clear: () => void;
  /** True when both halves are present, which is what every management call needs. */
  isComplete: boolean;
  /** `btoa(id:secret)`, or an empty string when incomplete — the shape the admin services take. */
  basicAuth: string;
}

const CredentialContext = createContext<CredentialContextValue | null>(null);

export function CredentialProvider({ children }: { children: ReactNode }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const clear = useCallback(() => {
    setClientId('');
    setClientSecret('');
  }, []);

  const value = useMemo<CredentialContextValue>(() => {
    const isComplete = Boolean(clientId && clientSecret);
    return {
      clientId,
      clientSecret,
      setClientId,
      setClientSecret,
      clear,
      isComplete,
      // Encoded here rather than in eight call sites, all of which were doing it by hand.
      basicAuth: isComplete ? btoa(`${clientId}:${clientSecret}`) : '',
    };
  }, [clientId, clientSecret, clear]);

  return <CredentialContext.Provider value={value}>{children}</CredentialContext.Provider>;
}

export function useCredentials(): CredentialContextValue {
  const ctx = useContext(CredentialContext);
  if (!ctx) throw new Error('useCredentials must be used within CredentialProvider');
  return ctx;
}
