import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { stepState } from '@/utils/step-state';
import { CLIENT_ID } from '@/config';
import type { McpFlow } from './use-mcp-flow';

/**
 * The six cards of the MCP flow, and nothing else.
 *
 * All of the sequencing lives in `use-mcp-flow.ts`; this file decides only what a step looks like and
 * when it is available. `stepState` greys a card whose prerequisite has not happened yet — which is the
 * one piece of logic that belongs here, because "can this step be attempted" is a rendering question and
 * **gating a step on the response object rather than on the field it is about to use** is how the FAPI
 * wizard came to have an enabled button that did nothing.
 */
function McpWizard({ flow }: { flow: McpFlow }) {
  return (
    <div className="mt-6 pt-4 border-t border-border">
      <h2 className="text-sm font-medium text-foreground mb-3">Full MCP Flow Wizard</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Walk through the complete MCP OAuth 2.1 flow step by step: discover the AS, register a
        client, authorize, exchange tokens, and fetch user info.
      </p>

      {/* ── Step 1: Discovery ─────────────────────────── */}
      <Card className="mb-3">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Step 1: Discover AS
            {flow.asData && <Badge variant="success">Done</Badge>}
            {flow.loading === 'Discover AS' && <Spinner size="sm" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Input
              label="Issuer URL"
              value={flow.issuer}
              onChange={(e) => flow.setIssuer(e.target.value)}
              placeholder="http://localhost:3000"
            />
            <Button onClick={flow.stepDiscover} loading={flow.loading === 'Discover AS'}>
              Fetch Metadata
            </Button>
            {flow.asData && (
              <div className="flex flex-wrap gap-2 mt-2">
                {flow.asData.issuer && (
                  <Badge variant="info">Issuer: {String(flow.asData.issuer).slice(0, 40)}</Badge>
                )}
                {flow.asData.registration_endpoint && (
                  <Badge variant="success">DCR Supported</Badge>
                )}
                {flow.asData.resource_indicators_supported && (
                  <Badge variant="success">Resource Indicators</Badge>
                )}
                {Array.isArray(flow.asData.code_challenge_methods_supported) &&
                  flow.asData.code_challenge_methods_supported.includes('S256') && (
                    <Badge variant="success">PKCE S256</Badge>
                  )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Step 2: Register Client ────────────────────── */}
      <Card {...stepState(Boolean(flow.asData), 'mb-3')}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Step 2: Register Client
            {flow.clientId !== CLIENT_ID && <Badge variant="success">Done</Badge>}
            {(flow.loading === 'Fetch CIMD' || flow.loading === 'DCR Register') && (
              <Spinner size="sm" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={flow.stepCimd}
                loading={flow.loading === 'Fetch CIMD'}
                disabled={!flow.cimdUrl}
                variant="default"
              >
                CIMD (URL as client_id)
              </Button>
              <Button
                onClick={flow.stepDcr}
                loading={flow.loading === 'DCR Register'}
                disabled={!flow.hasAdminCredential}
                variant="default"
              >
                DCR (admin register)
              </Button>
            </div>
            <Input
              label="CIMD URL (for CIMD flow)"
              value={flow.cimdUrl}
              onChange={(e) => flow.setCimdUrl(e.target.value)}
              placeholder="https://myapp.com/.well-known/oauth-client"
            />
            {flow.cimdData && (
              <div className="flex flex-wrap gap-2">
                {flow.cimdData.client_name && (
                  <Badge variant="info">{String(flow.cimdData.client_name)}</Badge>
                )}
                {flow.cimdData.token_endpoint_auth_method && (
                  <Badge variant="info">
                    Auth: {String(flow.cimdData.token_endpoint_auth_method)}
                  </Badge>
                )}
                {flow.cimdData.scope && (
                  <Badge variant="info">Scope: {String(flow.cimdData.scope)}</Badge>
                )}
              </div>
            )}
            <Input
              label="Client ID (auto-filled)"
              value={flow.clientId}
              onChange={(e) => flow.setClientId(e.target.value)}
              placeholder="client_id or CIMD URL"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Step 3: Authorize ──────────────────────────── */}
      <Card {...stepState(Boolean(flow.asData), 'mb-3')}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Step 3: Authorize (PKCE + Resource)
            {flow.authUrl && <Badge variant="success">URL Built</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {getDoc('mcp', 'authorize-url') && (
            <OperationDescription doc={getDoc('mcp', 'authorize-url')!} className="mb-3" />
          )}
          <div className="space-y-3">
            <Input
              label="Redirect URI"
              value={flow.redirectUri}
              onChange={(e) => flow.setRedirectUri(e.target.value)}
            />
            <Input
              label="Scopes"
              value={flow.scopes}
              onChange={(e) => flow.setScopes(e.target.value)}
            />
            <Input
              label="Resource (optional — MCP server URL)"
              value={flow.resource}
              onChange={(e) => flow.setResource(e.target.value)}
              placeholder="https://mcp-server.example.com"
            />
            <Button onClick={flow.stepAuthorize} disabled={!flow.asData || !flow.clientId}>
              Build Authorization URL
            </Button>
            {flow.authUrl && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Open this URL in a browser to authorize:
                </p>
                <a
                  href={flow.authUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent-text break-all hover:underline"
                >
                  {flow.authUrl}
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Step 4: Token Exchange ─────────────────────── */}
      <Card {...stepState(Boolean(flow.authUrl), 'mb-3')}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Step 4: Token Exchange
            {flow.tokenResult && <Badge variant="success">Done</Badge>}
            {flow.loading === 'Exchange Code' && <Spinner size="sm" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {getDoc('mcp', 'token-exchange') && (
            <OperationDescription doc={getDoc('mcp', 'token-exchange')!} className="mb-3" />
          )}
          <div className="space-y-3">
            <Input
              label="Authorization Code (from callback)"
              value={flow.code}
              onChange={(e) => flow.setCode(e.target.value)}
              placeholder="Paste code from ?code=... in callback URL"
            />
            <Input
              label="Code Verifier (auto-filled)"
              value={flow.codeVerifier}
              onChange={(e) => flow.setCodeVerifier(e.target.value)}
            />
            <Button
              onClick={flow.stepToken}
              loading={flow.loading === 'Exchange Code'}
              disabled={!flow.code || !flow.codeVerifier}
            >
              Exchange Code for Token
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Step 5: UserInfo ───────────────────────────── */}
      <Card {...stepState(Boolean(flow.tokenResult), 'mb-3')}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Step 5: Fetch UserInfo
            {flow.userinfoResult && <Badge variant="success">Done</Badge>}
            {flow.loading === 'Fetch UserInfo' && <Spinner size="sm" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {getDoc('mcp', 'userinfo') && (
            <OperationDescription doc={getDoc('mcp', 'userinfo')!} className="mb-3" />
          )}
          <div className="space-y-3">
            <Button
              onClick={flow.stepUserinfo}
              loading={flow.loading === 'Fetch UserInfo'}
              disabled={!flow.tokenResult}
            >
              Fetch UserInfo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Step 6: Introspect ─────────────────────────── */}
      <Card {...stepState(Boolean(flow.tokenResult), 'mb-3')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Step 6: Introspect the token
            {flow.introspectResult && <Badge variant="success">Done</Badge>}
            {flow.loading === 'Introspect' && <Spinner size="sm" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {getDoc('mcp', 'introspect') && (
              <OperationDescription doc={getDoc('mcp', 'introspect')!} />
            )}
            <Button
              onClick={flow.stepIntrospect}
              loading={flow.loading === 'Introspect'}
              disabled={!flow.tokenResult}
            >
              Introspect
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Results ─────────────────────────────────────── */}
      {flow.tokenResult && (
        <div className="mt-3">
          <JsonBlock data={flow.tokenResult} label="Token Response" />
        </div>
      )}
      {flow.userinfoResult && (
        <div className="mt-3">
          <JsonBlock data={flow.userinfoResult} label="UserInfo Response" />
        </div>
      )}
      {flow.introspectResult && (
        <div className="mt-3">
          <JsonBlock data={flow.introspectResult} label="Introspection Response" />
        </div>
      )}
    </div>
  );
}

export { McpWizard };
