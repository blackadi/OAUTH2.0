import { useState } from 'react';
import { vciService } from '@/services';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useToken } from '@/context/TokenContext';

/**
 * The three credential endpoints, which all present an **access token**.
 *
 * Asserted as one posture rather than one at a time, the way the server-side fix was:
 * `POST /api/vci/deferred/issue` used to collect no token at all, so a caller holding a
 * `transactionId` — a handle, not a credential — reached issuance while its two siblings on the same
 * router both answered `401`. **The asymmetry was the bug**, and it was found by
 * `check-route-coverage.mjs` rather than by reading the code. Keeping the three together is what makes
 * a fourth one that forgets look wrong.
 */
function VciCredentialPanels({
  op,
  loading,
  onRun,
}: {
  op: string;
  loading: boolean;
  onRun: (run: () => Promise<unknown>) => void;
}) {
  const { getAccessToken } = useToken();
  const [credAccessToken, setCredAccessToken] = useState(() => getAccessToken() || '');
  const [issueOrderJson, setIssueOrderJson] = useState('{"requestIdentifier":"cred-1"}');
  const [batchRequestsJson, setBatchRequestsJson] = useState(
    '[{"format":"jwt_vc_json","credential_definition":{"type":["VerifiableCredential"]}}]',
  );
  const [deferredOrderJson, setDeferredOrderJson] = useState('{"transactionId":"..."}');

  /** Fill the field from the token in context on first focus, rather than overwriting a typed one. */
  const handleTokenFocus = () => {
    const stored = getAccessToken();
    if (stored && !credAccessToken) setCredAccessToken(stored);
  };

  if (op === 'cred-issue') {
    return (
      <div className="space-y-3">
        <Input
          label="Access Token"
          value={credAccessToken}
          onChange={(e) => setCredAccessToken(e.target.value)}
          placeholder="access-token"
          onFocus={handleTokenFocus}
        />
        <p className="text-xs text-muted-foreground">
          Uses <code>Authorization: Bearer</code> header. Auto-filled from token vault on focus. Get
          a token from <strong>Auth Flows</strong> (authorization code, client credentials, or
          pre-authorized code).
        </p>
        <Textarea
          label="Order (JSON)"
          rows={6}
          value={issueOrderJson}
          onChange={(e) => setIssueOrderJson(e.target.value)}
          placeholder='{"requestIdentifier":"cred-1"}'
        />
        <Button
          onClick={() => {
            let order: unknown = {};
            try {
              order = JSON.parse(issueOrderJson);
            } catch {
              order = { requestIdentifier: issueOrderJson };
            }
            onRun(() => vciService.issueCredential({ accessToken: credAccessToken, order }));
          }}
          loading={loading}
        >
          Issue Credential
        </Button>
      </div>
    );
  }
  if (op === 'cred-batch') {
    return (
      <div className="space-y-3">
        <Input
          label="Access Token"
          value={credAccessToken}
          onChange={(e) => setCredAccessToken(e.target.value)}
          placeholder="access-token"
          onFocus={handleTokenFocus}
        />
        <p className="text-xs text-muted-foreground">
          Request multiple credential types at once (OID4VCI §10). Each entry specifies the format
          and credential type.
        </p>
        <div className="p-2 rounded bg-tint-accent border border-edge-accent">
          <p className="text-xs text-accent-text">
            <strong>credential_requests</strong> format (OID4VCI):
            <br />
            <code className="text-2xs">
              {'[{"format":"vc+sd-jwt","vct":"..."},{"format":"mso_mdoc","doctype":"..."}]'}
            </code>
          </p>
        </div>
        <Textarea
          label="Requests (JSON array)"
          rows={8}
          value={batchRequestsJson}
          onChange={(e) => setBatchRequestsJson(e.target.value)}
          placeholder='[{"format":"vc+sd-jwt","vct":"https://credentials.example.com/identity_credential"},{"format":"mso_mdoc","doctype":"org.iso.18013.5.1.mDL"}]'
        />
        <Button
          onClick={() => {
            let parsed: unknown = [];
            try {
              parsed = JSON.parse(batchRequestsJson);
            } catch {
              parsed = [];
            }
            onRun(() =>
              vciService.batchCredential({
                accessToken: credAccessToken,
                credential_requests: parsed,
              }),
            );
          }}
          loading={loading}
        >
          Batch Issue
        </Button>
      </div>
    );
  }
  if (op === 'deferred-issue') {
    return (
      <div className="space-y-3">
        <Input
          label="Access Token"
          value={credAccessToken}
          onChange={(e) => setCredAccessToken(e.target.value)}
          placeholder="access-token"
          onFocus={handleTokenFocus}
        />
        <p className="text-xs text-muted-foreground">
          Poll for a credential that was deferred (returned 202 Accepted with{' '}
          <code>transaction_id</code>). Set the <code>transactionId</code> from the issue response.
          Requires the <strong>same access token</strong> used at the Credential tab — the server
          validates it via Authlete&apos;s deferred <em>parse</em> API before issuing.
        </p>
        <Textarea
          label="Order (JSON)"
          rows={6}
          value={deferredOrderJson}
          onChange={(e) => setDeferredOrderJson(e.target.value)}
          placeholder='{"transactionId":"..."}'
        />
        <Button
          onClick={() => {
            let order: unknown = {};
            try {
              order = JSON.parse(deferredOrderJson);
            } catch {
              order = { transactionId: deferredOrderJson };
            }
            onRun(() => vciService.issueDeferred({ accessToken: credAccessToken, order }));
          }}
          loading={loading}
        >
          Issue Deferred
        </Button>
      </div>
    );
  }
  return null;
}

export { VciCredentialPanels };
