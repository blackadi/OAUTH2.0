import { Input } from '@/components/ui/Input';
import { useCredentials } from '@/context/CredentialContext';

/**
 * The management credential fields, backed by one shared profile.
 *
 * Eight sections each held their own `useState` pair for the same two values, and a route change
 * unmounts a section — so the credentials had to be retyped on every navigation, for half the app's
 * surface. This reads and writes the shared context instead, so entering them once is enough.
 *
 * The controlled props are kept for the callers that genuinely hold a *different* credential (a client
 * secret, say), which is why they are optional rather than removed.
 */
interface AdminAuthProps {
  clientId?: string;
  clientSecret?: string;
  onClientIdChange?: (val: string) => void;
  onClientSecretChange?: (val: string) => void;
  label?: string;
}

function AdminAuth({
  clientId,
  clientSecret,
  onClientIdChange,
  onClientSecretChange,
  label,
}: AdminAuthProps) {
  const shared = useCredentials();

  // A caller that supplies a value owns it; everyone else shares.
  const id = clientId ?? shared.clientId;
  const secret = clientSecret ?? shared.clientSecret;
  const setId = onClientIdChange ?? shared.setClientId;
  const setSecret = onClientSecretChange ?? shared.setClientSecret;

  return (
    <div className="p-3 bg-muted/30 rounded-lg space-y-2 mb-3">
      <Input
        label={label ? `${label} Client ID` : 'Admin Client ID'}
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="MGMT_CLIENT_ID"
      />
      <Input
        label={label ? `${label} Client Secret` : 'Admin Client Secret'}
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        placeholder="MGMT_CLIENT_SECRET"
      />
      {!clientId && shared.isComplete && (
        <p className="text-2xs text-muted-foreground">
          Shared across every admin section for this page — enter them once.
        </p>
      )}
    </div>
  );
}

export { AdminAuth };
