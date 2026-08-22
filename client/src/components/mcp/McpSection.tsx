import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { mcpService, dcrService } from '@/services';
import { useAsyncCall, useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { TabBar } from '@/components/ui/TabBar';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { Spinner } from '@/components/ui/Spinner';
import { getDoc } from '@/data/operationDocs';
import { stepState } from '@/utils/step-state';
import { parseJsonObject, stringMember } from '@/utils/parse-json';
import { API_BASE_URL, CLIENT_ID, REDIRECT_URI, DEFAULT_SCOPES } from '@/config';
import { createPkcePair } from '@/pkce';
import { useCredentials } from '@/context/CredentialContext';

type McpOp = 'discovery' | 'resource-metadata' | 'cimd';

const MCP_OPS: { value: McpOp; label: string }[] = [
  { value: 'discovery', label: 'AS Metadata' },
  { value: 'resource-metadata', label: 'Protected Resource' },
  { value: 'cimd', label: 'CIMD Metadata' },
];

interface AsMetadata {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  registration_endpoint?: string;
  resource_indicators_supported?: boolean;
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
  grant_types_supported?: string[];
  response_types_supported?: string[];
  [key: string]: unknown;
}

interface CimdMetadata {
  client_name?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
  [key: string]: unknown;
}

function McpSection() {
  const [activeOp, setActiveOp] = useState<McpOp | null>(null);
  const { loading, result, error, call } = useAsyncCall();
  const wizAsync = useDiscriminatedAsyncCall<string>();
  const { loading: wizLoading, error: wizError, call: wizCall } = wizAsync;
  // The management credential is shared for the page rather than owned here: eight sections
  // held their own copy, and a route change unmounts a section, so it had to be retyped on
  // every navigation.
  const { clientId: authId, clientSecret: authSecret } = useCredentials();

  // Discovery state
  const [issuerUrl, setIssuerUrl] = useState(API_BASE_URL);

  // Resource metadata state
  const [resourceUrl, setResourceUrl] = useState('http://localhost:3000');

  // CIMD state
  const [cimdUrl, setCimdUrl] = useState('');

  // Wizard state
  const [wizIssuer, setWizIssuer] = useState(API_BASE_URL);
  const [wizAsData, setWizAsData] = useState<AsMetadata | null>(null);
  const [wizCimdUrl, setWizCimdUrl] = useState('');
  const [wizCimdData, setWizCimdData] = useState<CimdMetadata | null>(null);
  const [wizClientId, setWizClientId] = useState(CLIENT_ID);
  /**
   * Kept, not discarded. Step 2 read the DCR `client_secret` into a local, used it in a toast and threw
   * it away, so step 4 exchanged the code with no client authentication for a client it had just
   * registered as confidential. Registration now asks for `NONE`, but Authlete may answer with a
   * secret anyway (AGENTS.md, "Client auth for DCR confidential clients"), and `exchangeCode` sends it
   * only when non-empty.
   */
  const [wizClientSecret, setWizClientSecret] = useState('');
  const [wizRedirectUri, setWizRedirectUri] = useState(REDIRECT_URI);
  const [wizScopes, setWizScopes] = useState(DEFAULT_SCOPES);
  const [wizResource, setWizResource] = useState('');
  const [wizCode, setWizCode] = useState('');
  const [wizCodeVerifier, setWizCodeVerifier] = useState('');
  // No `wizPkcePair` state: it was written on every authorize step and never read. `wizCodeVerifier` below
  // holds the only half the token exchange needs, and the challenge is consumed inline by the URL builder.
  const [wizAuthUrl, setWizAuthUrl] = useState('');
  const [wizTokenResult, setWizTokenResult] = useState<Record<string, unknown> | null>(null);
  const [wizUserinfoResult, setWizUserinfoResult] = useState<Record<string, unknown> | null>(null);

  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';
  const doc = activeOp ? getDoc('mcp', activeOp) : undefined;

  const handleDiscovery = async () => {
    const { data, error: err } = await call(() => mcpService.fetchAsMetadata(issuerUrl));
    if (data) {
      toast.success('AS metadata loaded');
    } else {
      toast.error(err);
    }
  };

  const handleResourceMetadata = async () => {
    const { data, error: err } = await call(() =>
      mcpService.fetchProtectedResourceMetadata(resourceUrl),
    );
    if (data) {
      toast.success('Protected resource metadata loaded');
    } else {
      toast.error(err);
    }
  };

  const handleCimdFetch = async () => {
    const { data, error: err } = await call(() => mcpService.fetchCimdMetadata(cimdUrl));
    if (data) {
      toast.success('CIMD metadata loaded');
    } else {
      toast.error(err);
    }
  };

  // Wizard step handlers
  const wizStepDiscover = useCallback(async () => {
    const { data, error: err } = await wizCall('Discover AS', () =>
      mcpService.fetchAsMetadata(wizIssuer),
    );
    if (data) {
      const asData = data as AsMetadata;
      setWizAsData(asData);
      toast.success('AS metadata loaded');
    } else {
      toast.error(err);
    }
  }, [wizIssuer, wizCall]);

  const wizStepCimd = useCallback(async () => {
    if (!wizCimdUrl) {
      toast.error('Enter a CIMD URL first');
      return;
    }
    const { data, error: err } = await wizCall('Fetch CIMD', () =>
      mcpService.fetchCimdMetadata(wizCimdUrl),
    );
    if (data) {
      const cimdData = data as CimdMetadata;
      setWizCimdData(cimdData);
      // Pre-fill from CIMD metadata
      if (cimdData.redirect_uris?.[0]) setWizRedirectUri(cimdData.redirect_uris[0]);
      if (cimdData.scope) setWizScopes(cimdData.scope);
      // Use CIMD URL as client_id
      setWizClientId(wizCimdUrl);
      toast.success('CIMD metadata loaded — client_id set to CIMD URL');
    } else {
      toast.error(err);
    }
  }, [wizCimdUrl, wizCall]);

  const wizStepDcr = useCallback(async () => {
    if (!auth) {
      toast.error('Enter admin credentials first');
      return;
    }
    const metadata = {
      client_name: 'MCP Test Client',
      redirect_uris: [wizRedirectUri],
      grant_types: ['AUTHORIZATION_CODE', 'REFRESH_TOKEN'],
      response_types: ['CODE'],
      // A public client with PKCE, which is what MCP and OAuth 2.1 expect of a browser app — and it
      // is what step 3 already does. This asked for `CLIENT_SECRET_BASIC`, whose secret step 4 then
      // failed to present.
      token_endpoint_auth_method: 'NONE',
      scope: wizScopes,
    };
    const { data, error: err } = await wizCall('DCR Register', () =>
      dcrService.dcrRegister({ json: JSON.stringify(metadata) }, auth),
    );
    if (data) {
      const raw = data as Record<string, unknown>;
      /**
       * Asked, not asserted.
       *
       * These four reads were `(responseContent.client_id || responseContent.clientId || '') as string`
       * off a `JSON.parse` result — so the compiler checked nothing about a value that becomes the
       * **client secret** used for the token exchange two steps later. `stringMember` returns a string
       * only if there is one, and both spellings are tried because DCR answers snake_case while
       * Authlete's envelope answers camelCase.
       */
      const responseContent =
        typeof raw.responseContent === 'string' ? parseJsonObject(raw.responseContent) : raw;
      const clientId = stringMember(responseContent, 'client_id', 'clientId') ?? '';
      const clientSecret = stringMember(responseContent, 'client_secret', 'clientSecret') ?? '';
      if (clientId) {
        setWizClientId(clientId);
        setWizClientSecret(clientSecret);
        toast.success(
          `DCR registered: client_id=${clientId}${clientSecret ? ' — a secret came back despite asking for NONE; it will be sent on the exchange' : ' (public, PKCE only)'}`,
        );
      }
    } else {
      toast.error(err);
    }
  }, [auth, wizRedirectUri, wizScopes, wizCall]);

  const wizStepAuthorize = useCallback(async () => {
    const pair = await createPkcePair();
    setWizCodeVerifier(pair.codeVerifier);

    const authUrl = mcpService.buildAuthorizationUrl({
      issuer: wizIssuer,
      clientId: wizClientId,
      redirectUri: wizRedirectUri,
      scope: wizScopes,
      codeChallenge: pair.codeChallenge,
      resource: wizResource || undefined,
      state: `mcp-${Date.now()}`,
    });
    setWizAuthUrl(authUrl);
    toast.success('Authorization URL built — open in browser');
  }, [wizIssuer, wizClientId, wizRedirectUri, wizScopes, wizResource]);

  const wizStepToken = useCallback(async () => {
    if (!wizCode || !wizCodeVerifier) {
      toast.error('Enter the authorization code from the callback');
      return;
    }
    const tokenEndpoint = wizAsData?.token_endpoint || `${wizIssuer}/api/token`;
    const { data, error: err } = await wizCall('Exchange Code', () =>
      mcpService.exchangeCode({
        tokenEndpoint,
        code: wizCode,
        clientId: wizClientId,
        redirectUri: wizRedirectUri,
        codeVerifier: wizCodeVerifier,
        // MCP requires `resource` on BOTH requests. The same value the authorize step used.
        resource: wizResource || undefined,
        clientSecret: wizClientSecret || undefined,
      }),
    );
    if (data) {
      setWizTokenResult(data as Record<string, unknown>);
      toast.success('Token exchange successful');
    } else {
      toast.error(err);
    }
  }, [
    wizCode,
    wizCodeVerifier,
    wizAsData,
    wizIssuer,
    wizClientId,
    wizClientSecret,
    wizRedirectUri,
    wizResource,
    wizCall,
  ]);

  const wizStepUserinfo = useCallback(async () => {
    const accessToken = (wizTokenResult as Record<string, unknown>)?.access_token as string;
    if (!accessToken) {
      toast.error('No access token available — complete token exchange first');
      return;
    }
    const userinfoEndpoint = wizAsData?.userinfo_endpoint || `${wizIssuer}/api/userinfo`;
    const { data, error: err } = await wizCall('Fetch UserInfo', () =>
      mcpService.fetchUserInfo(userinfoEndpoint, accessToken),
    );
    if (data) {
      setWizUserinfoResult(data as Record<string, unknown>);
      toast.success('UserInfo fetched');
    } else {
      toast.error(err);
    }
  }, [wizTokenResult, wizAsData, wizIssuer, wizCall]);

  const [wizIntrospectResult, setWizIntrospectResult] = useState<Record<string, unknown> | null>(
    null,
  );

  /**
   * Introspect the token the wizard just obtained.
   *
   * `mcpService.introspectToken` existed and was called from nowhere, so the `mcp.introspect` entry in
   * the documentation registry had no surface to render on — and had it been wired as written it would
   * have failed, because it sent no credentials to an endpoint that requires them. Both halves are
   * closed here: the endpoint comes from the AS metadata the wizard already fetched rather than from
   * string surgery on the token endpoint, and the admin credentials come from the field at the top of
   * this section. RFC 7662 §2.1 requires the endpoint to be protected; this deployment protects it with
   * management credentials, so without them the answer is 401 and nothing else.
   */
  const wizStepIntrospect = useCallback(async () => {
    const accessToken = (wizTokenResult as Record<string, unknown>)?.access_token as string;
    if (!accessToken) {
      toast.error('No access token available — complete token exchange first');
      return;
    }
    if (!authId || !authSecret) {
      toast.error("Introspection needs this deployment's admin credentials — fill them in above");
      return;
    }
    const endpoint =
      (wizAsData?.introspection_endpoint as string | undefined) ||
      `${wizIssuer}/api/introspection/standard`;
    const { data, error: err } = await wizCall('Introspect', () =>
      mcpService.introspectToken(endpoint, accessToken, authId, authSecret),
    );
    if (data) {
      setWizIntrospectResult(data as Record<string, unknown>);
      toast.success('Token introspected');
    } else {
      toast.error(err);
    }
  }, [wizTokenResult, wizAsData, wizIssuer, authId, authSecret, wizCall]);

  return (
    <SectionPanel
      title="MCP (Model Context Protocol) OAuth 2.1"
      description="Test MCP authorization flows — discovery, CIMD registration, and full PKCE + resource indicator flow"
    >
      <AdminAuth label="Admin (for DCR)" />

      {error && <ErrorExplainer error={error} className="mb-3" />}
      {wizError && <p className="text-xs text-danger-text">{wizError}</p>}

      <TabBar options={MCP_OPS} value={activeOp} onChange={setActiveOp} />

      {activeOp && doc && <OperationDescription doc={doc} />}

      {/* ── Tab: AS Metadata ─────────────────────────────── */}
      {activeOp === 'discovery' && (
        <div className="space-y-3">
          <Input
            label="Issuer URL"
            value={issuerUrl}
            onChange={(e) => setIssuerUrl(e.target.value)}
            placeholder="http://localhost:3000"
          />
          <Button onClick={handleDiscovery} loading={loading}>
            Fetch AS Metadata
          </Button>
        </div>
      )}

      {/* ── Tab: Protected Resource Metadata ──────────────── */}
      {activeOp === 'resource-metadata' && (
        <div className="space-y-3">
          <Input
            label="Resource URL"
            value={resourceUrl}
            onChange={(e) => setResourceUrl(e.target.value)}
            placeholder="http://localhost:3000"
          />
          <Button onClick={handleResourceMetadata} loading={loading}>
            Fetch Resource Metadata
          </Button>
        </div>
      )}

      {/* ── Tab: CIMD Metadata ────────────────────────────── */}
      {activeOp === 'cimd' && (
        <div className="space-y-3">
          <Input
            label="CIMD URL"
            value={cimdUrl}
            onChange={(e) => setCimdUrl(e.target.value)}
            placeholder="https://myapp.com/.well-known/oauth-client"
          />
          <Button onClick={handleCimdFetch} loading={loading}>
            Fetch CIMD Metadata
          </Button>
        </div>
      )}

      {/* ── Results from tabs ──────────────────────────────── */}
      {result ? <JsonBlock data={result} label="Response" /> : null}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ── Full Flow Wizard ────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
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
              {wizAsData && <Badge variant="success">Done</Badge>}
              {wizLoading === 'Discover AS' && <Spinner size="sm" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Input
                label="Issuer URL"
                value={wizIssuer}
                onChange={(e) => setWizIssuer(e.target.value)}
                placeholder="http://localhost:3000"
              />
              <Button onClick={wizStepDiscover} loading={wizLoading === 'Discover AS'}>
                Fetch Metadata
              </Button>
              {wizAsData && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {wizAsData.issuer && (
                    <Badge variant="info">Issuer: {String(wizAsData.issuer).slice(0, 40)}</Badge>
                  )}
                  {wizAsData.registration_endpoint && (
                    <Badge variant="success">DCR Supported</Badge>
                  )}
                  {wizAsData.resource_indicators_supported && (
                    <Badge variant="success">Resource Indicators</Badge>
                  )}
                  {Array.isArray(wizAsData.code_challenge_methods_supported) &&
                    wizAsData.code_challenge_methods_supported.includes('S256') && (
                      <Badge variant="success">PKCE S256</Badge>
                    )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Step 2: Register Client ────────────────────── */}
        <Card {...stepState(Boolean(wizAsData), 'mb-3')}>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Step 2: Register Client
              {wizClientId !== CLIENT_ID && <Badge variant="success">Done</Badge>}
              {(wizLoading === 'Fetch CIMD' || wizLoading === 'DCR Register') && (
                <Spinner size="sm" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={wizStepCimd}
                  loading={wizLoading === 'Fetch CIMD'}
                  disabled={!wizCimdUrl}
                  variant="default"
                >
                  CIMD (URL as client_id)
                </Button>
                <Button
                  onClick={wizStepDcr}
                  loading={wizLoading === 'DCR Register'}
                  disabled={!auth}
                  variant="default"
                >
                  DCR (admin register)
                </Button>
              </div>
              <Input
                label="CIMD URL (for CIMD flow)"
                value={wizCimdUrl}
                onChange={(e) => setWizCimdUrl(e.target.value)}
                placeholder="https://myapp.com/.well-known/oauth-client"
              />
              {wizCimdData && (
                <div className="flex flex-wrap gap-2">
                  {wizCimdData.client_name && (
                    <Badge variant="info">{String(wizCimdData.client_name)}</Badge>
                  )}
                  {wizCimdData.token_endpoint_auth_method && (
                    <Badge variant="info">
                      Auth: {String(wizCimdData.token_endpoint_auth_method)}
                    </Badge>
                  )}
                  {wizCimdData.scope && (
                    <Badge variant="info">Scope: {String(wizCimdData.scope)}</Badge>
                  )}
                </div>
              )}
              <Input
                label="Client ID (auto-filled)"
                value={wizClientId}
                onChange={(e) => setWizClientId(e.target.value)}
                placeholder="client_id or CIMD URL"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Step 3: Authorize ──────────────────────────── */}
        <Card {...stepState(Boolean(wizAsData), 'mb-3')}>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Step 3: Authorize (PKCE + Resource)
              {wizAuthUrl && <Badge variant="success">URL Built</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getDoc('mcp', 'authorize-url') && (
              <OperationDescription doc={getDoc('mcp', 'authorize-url')!} className="mb-3" />
            )}
            <div className="space-y-3">
              <Input
                label="Redirect URI"
                value={wizRedirectUri}
                onChange={(e) => setWizRedirectUri(e.target.value)}
              />
              <Input
                label="Scopes"
                value={wizScopes}
                onChange={(e) => setWizScopes(e.target.value)}
              />
              <Input
                label="Resource (optional — MCP server URL)"
                value={wizResource}
                onChange={(e) => setWizResource(e.target.value)}
                placeholder="https://mcp-server.example.com"
              />
              <Button onClick={wizStepAuthorize} disabled={!wizAsData || !wizClientId}>
                Build Authorization URL
              </Button>
              {wizAuthUrl && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Open this URL in a browser to authorize:
                  </p>
                  <a
                    href={wizAuthUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-text break-all hover:underline"
                  >
                    {wizAuthUrl}
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Step 4: Token Exchange ─────────────────────── */}
        <Card {...stepState(Boolean(wizAuthUrl), 'mb-3')}>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Step 4: Token Exchange
              {wizTokenResult && <Badge variant="success">Done</Badge>}
              {wizLoading === 'Exchange Code' && <Spinner size="sm" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getDoc('mcp', 'token-exchange') && (
              <OperationDescription doc={getDoc('mcp', 'token-exchange')!} className="mb-3" />
            )}
            <div className="space-y-3">
              <Input
                label="Authorization Code (from callback)"
                value={wizCode}
                onChange={(e) => setWizCode(e.target.value)}
                placeholder="Paste code from ?code=... in callback URL"
              />
              <Input
                label="Code Verifier (auto-filled)"
                value={wizCodeVerifier}
                onChange={(e) => setWizCodeVerifier(e.target.value)}
              />
              <Button
                onClick={wizStepToken}
                loading={wizLoading === 'Exchange Code'}
                disabled={!wizCode || !wizCodeVerifier}
              >
                Exchange Code for Token
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Step 5: UserInfo ───────────────────────────── */}
        <Card {...stepState(Boolean(wizTokenResult), 'mb-3')}>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Step 5: Fetch UserInfo
              {wizUserinfoResult && <Badge variant="success">Done</Badge>}
              {wizLoading === 'Fetch UserInfo' && <Spinner size="sm" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getDoc('mcp', 'userinfo') && (
              <OperationDescription doc={getDoc('mcp', 'userinfo')!} className="mb-3" />
            )}
            <div className="space-y-3">
              <Button
                onClick={wizStepUserinfo}
                loading={wizLoading === 'Fetch UserInfo'}
                disabled={!wizTokenResult}
              >
                Fetch UserInfo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Step 6: Introspect ─────────────────────────── */}
        <Card {...stepState(Boolean(wizTokenResult), 'mb-3')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Step 6: Introspect the token
              {wizIntrospectResult && <Badge variant="success">Done</Badge>}
              {wizLoading === 'Introspect' && <Spinner size="sm" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {getDoc('mcp', 'introspect') && (
                <OperationDescription doc={getDoc('mcp', 'introspect')!} />
              )}
              <Button
                onClick={wizStepIntrospect}
                loading={wizLoading === 'Introspect'}
                disabled={!wizTokenResult}
              >
                Introspect
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Results ─────────────────────────────────────── */}
        {wizTokenResult && (
          <div className="mt-3">
            <JsonBlock data={wizTokenResult} label="Token Response" />
          </div>
        )}
        {wizUserinfoResult && (
          <div className="mt-3">
            <JsonBlock data={wizUserinfoResult} label="UserInfo Response" />
          </div>
        )}
        {wizIntrospectResult && (
          <div className="mt-3">
            <JsonBlock data={wizIntrospectResult} label="Introspection Response" />
          </div>
        )}
      </div>
    </SectionPanel>
  );
}

export { McpSection };
