import { useState } from 'react';
import { toast } from 'sonner';
import { grantService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';

function GrantManagementSection() {
  const [accessToken, setAccessToken] = useState('');
  const [grantId, setGrantId] = useState('');
  const { loading, result, error, call } = useAsyncCall();

  const handleQuery = async () => {
    const { data, error: err } = await call(() => grantService.queryGrant(accessToken, grantId));
    if (data) {
      toast.success('Operation completed');
    } else {
      toast.error(err);
    }
  };

  const handleRevoke = async () => {
    const { data, error: err } = await call(() => grantService.revokeGrant(accessToken, grantId));
    if (data) {
      toast.success('Operation completed');
    } else {
      toast.error(err);
    }
  };

  return (
    <SectionPanel
      title="Grant Management"
      description="Query and revoke grants (Grant Management for OAuth 2.0)"
    >
      <div className="space-y-3">
        <Input
          label="Access Token"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder="Bearer token with grant_management_query or grant_management_revoke scope"
        />
        <Input
          label="Grant ID"
          value={grantId}
          onChange={(e) => setGrantId(e.target.value)}
          placeholder="The grant_id obtained from a token response"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!accessToken || !grantId || loading}
          loading={loading}
          onClick={handleQuery}
        >
          Query
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={!accessToken || !grantId || loading}
          loading={loading}
          onClick={handleRevoke}
        >
          Revoke
        </Button>
      </div>

      {result ? <JsonBlock data={result} label="Response" /> : null}
    </SectionPanel>
  );
}

export { GrantManagementSection };
