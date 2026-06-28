import { Input } from '@/components/ui/Input';

interface AdminAuthProps {
  clientId: string;
  clientSecret: string;
  onClientIdChange: (val: string) => void;
  onClientSecretChange: (val: string) => void;
  label?: string;
}

function AdminAuth({
  clientId,
  clientSecret,
  onClientIdChange,
  onClientSecretChange,
  label,
}: AdminAuthProps) {
  return (
    <div className="p-3 bg-muted/30 rounded-lg space-y-2 mb-3">
      <Input
        label={label ? `${label} Client ID` : 'Admin Client ID'}
        value={clientId}
        onChange={(e) => onClientIdChange(e.target.value)}
        placeholder="MGMT_CLIENT_ID"
      />
      <Input
        label={label ? `${label} Client Secret` : 'Admin Client Secret'}
        type="password"
        value={clientSecret}
        onChange={(e) => onClientSecretChange(e.target.value)}
        placeholder="MGMT_CLIENT_SECRET"
      />
    </div>
  );
}

export { AdminAuth };
