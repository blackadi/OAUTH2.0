import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { stepState } from '@/utils/step-state';
import { getJwkSetDisplay } from '@/services/client-assertion.service';
import type { FapiFlow } from './use-fapi-flow';

/**
 * The four steps of the FAPI 2.0 test flow, and nothing else.
 *
 * `stepState` greys a step whose prerequisite has not happened — and **each gate names the field it is
 * about to use**, not the response object that contains it. Step 2 was gated on `!wizParResult` while
 * its handler returned early on `request_uri` being undefined, which made the button enabled and inert:
 * no redirect, no error, and the `request_uri` visible in the panel directly above it.
 */
function FapiTestFlow({ flow }: { flow: FapiFlow }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>FAPI 2.0 SP Test Flow</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Demonstrates a FAPI 2.0 Security Profile authorization code flow with{' '}
          <code className="text-foreground-muted">private_key_jwt</code> client authentication and
          DPoP sender-constrained tokens. Requires a client configured with{' '}
          <code className="text-foreground-muted">PRIVATE_KEY_JWT</code> token auth method in
          Authlete Console.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Was a bare red paragraph. A `[A157303]` here means a stored FAPI signing key silently
              rewired the exchange to `private_key_jwt` — which `AUTHLETE_NOTES` explains and a raw
              string does not. */}
        {!!flow.error && <ErrorExplainer error={String(flow.error)} />}

        <div id="fapi-setup" tabIndex={-1}>
          <h2 className="text-sm font-medium mb-3">Setup: Client Configuration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input
              label="Client ID"
              value={flow.clientId}
              onChange={(e) => flow.setClientId(e.target.value)}
              placeholder="your_client_id"
            />
            <Input
              label="Redirect URI"
              value={flow.redirectUri}
              onChange={(e) => flow.setRedirectUri(e.target.value)}
              placeholder="http://localhost:3001/callback"
            />
            <Input
              label="Scopes (incl. fapi2=sp scope)"
              value={flow.scopes}
              onChange={(e) => flow.setScopes(e.target.value)}
              placeholder="fapi_scope openid"
            />
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Make sure your Authlete service has a scope with the{' '}
            <code className="text-muted-foreground">fapi2=sp</code> attribute and your client uses{' '}
            <code className="text-muted-foreground">PRIVATE_KEY_JWT</code> auth method.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={flow.generateSigningKey}
              loading={flow.loading === 'setup'}
              size="sm"
              disabled={!!flow.signingKey}
            >
              Generate Client Auth Key
            </Button>
            <Button
              onClick={flow.generateDpopKey}
              loading={flow.loading === 'setup'}
              size="sm"
              disabled={!!flow.dpopKeyPair}
            >
              Generate DPoP Key
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
            {flow.signingKey && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Register this JWK in Authlete Console → Client → JWK Set. Delete any existing key.
                </p>
                <Textarea
                  label="Client Auth Public Key (JWK Set)"
                  rows={6}
                  value={getJwkSetDisplay(flow.signingKey.publicKey)}
                  readOnly
                />
              </div>
            )}
            {flow.dpopKeyPair && (
              <JsonBlock data={flow.dpopKeyPair.publicKey} label="DPoP Public Key (JWK)" />
            )}
          </div>
        </div>

        <div
          id="fapi-step-1"
          tabIndex={-1}
          {...stepState(
            Boolean(flow.dpopKeyPair && flow.signingKey),
            'border-t border-border pt-4',
          )}
        >
          <h2 className="text-sm font-medium mb-2">Step 1: Push Authorization Request (PAR)</h2>
          <p className="text-xs text-muted-foreground mb-2">
            Pushes authorization parameters with a{' '}
            <code className="text-foreground-muted">private_key_jwt</code> client assertion and DPoP
            proof. Also generates PKCE challenge and state.
          </p>
          <Button
            onClick={flow.pushPar}
            loading={flow.loading === 'par'}
            size="sm"
            disabled={!flow.dpopKeyPair || !flow.signingKey}
          >
            Push PAR
          </Button>
          {flow.parResult && (
            <div className="mt-2">
              <JsonBlock data={flow.parResult} label="PAR Response" />
            </div>
          )}
        </div>

        <div
          id="fapi-step-2"
          tabIndex={-1}
          {...stepState(Boolean(flow.parResult?.request_uri), 'border-t border-border pt-4')}
        >
          <h2 className="text-sm font-medium mb-2">Step 2: Authorize</h2>
          <p className="text-xs text-muted-foreground mb-2">
            Opens the authorization page. After login + consent, you are redirected to the callback
            page where the code is exchanged for tokens using{' '}
            <code className="text-foreground-muted">private_key_jwt</code> + DPoP. Navigate back
            here for Step 3.
          </p>
          <Button
            onClick={flow.authorize}
            size="sm"
            variant="secondary"
            disabled={!flow.parResult?.request_uri}
          >
            Open Authorize Page
          </Button>
        </div>

        <div id="fapi-step-3" tabIndex={-1} className="border-t border-border pt-4">
          <h2 className="text-sm font-medium mb-2">Step 3: Call Userinfo with DPoP</h2>
          <p className="text-xs text-muted-foreground mb-2">
            Uses the stored DPoP key and access token from the callback. The DPoP proof includes the{' '}
            <code className="text-foreground-muted">ath</code> claim (hash of the access token).
          </p>
          <Button
            onClick={flow.fetchUserinfo}
            loading={flow.loading === 'userinfo'}
            size="sm"
            disabled={!flow.hasToken}
          >
            Call Userinfo with DPoP
          </Button>
          {!flow.hasToken && (
            <p className="text-xs text-warning-text mt-1">
              No access token found. Complete Step 2 first.
            </p>
          )}
          {flow.userinfoResult && (
            <div className="mt-2">
              <JsonBlock data={flow.userinfoResult} label="Userinfo Response" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { FapiTestFlow };
