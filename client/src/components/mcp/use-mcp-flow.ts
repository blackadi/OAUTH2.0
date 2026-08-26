import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { mcpService, dcrService } from '@/services';
import { useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { parseJsonObject, stringMember } from '@/utils/parse-json';
import { API_BASE_URL, CLIENT_ID, REDIRECT_URI, DEFAULT_SCOPES } from '@/config';
import { createPkcePair } from '@/pkce';
import { useCredentials } from '@/context/CredentialContext';

/**
 * The MCP OAuth 2.1 flow, as one hook.
 *
 * **Why this is separated from the rendering.** `McpSection` was 661 lines carrying twenty `useState`
 * calls, and fifteen of them belonged to the six-step wizard rather than to the three discovery tabs
 * above it. The wizard is a **sequence** — discover, register, authorize, exchange, userinfo,
 * introspect — where each step consumes what the one before it produced, and that is the part worth
 * being able to read on its own: `McpWizard.tsx` is now the six cards and nothing else.
 *
 * The two dead flows this section carried were both in here, and both were hand-offs between steps
 * rather than anything visual: step 2 read the DCR `client_secret` into a local used only in a toast, so
 * step 4 exchanged the code with no client authentication; and `introspectToken` existed and was called
 * from nowhere, so the `mcp.introspect` doc entry had no surface to render on. Keeping the sequence in
 * one file is what makes a missing hand-off visible.
 */

export interface AsMetadata {
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

export interface CimdMetadata {
  client_name?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
  [key: string]: unknown;
}

export function useMcpFlow() {
  const { loading, error, call: wizCall } = useDiscriminatedAsyncCall<string>();
  // The management credential is shared for the page rather than owned here: eight sections held their
  // own copy, and a route change unmounts a section, so it had to be retyped on every navigation.
  const { clientId: authId, clientSecret: authSecret } = useCredentials();

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
  const [wizIntrospectResult, setWizIntrospectResult] = useState<Record<string, unknown> | null>(
    null,
  );

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

  return {
    loading,
    error,
    /** Every field the six cards render, and the setters for the ones a user can type into. */
    issuer: wizIssuer,
    setIssuer: setWizIssuer,
    asData: wizAsData,
    cimdUrl: wizCimdUrl,
    setCimdUrl: setWizCimdUrl,
    cimdData: wizCimdData,
    clientId: wizClientId,
    setClientId: setWizClientId,
    redirectUri: wizRedirectUri,
    setRedirectUri: setWizRedirectUri,
    scopes: wizScopes,
    setScopes: setWizScopes,
    resource: wizResource,
    setResource: setWizResource,
    code: wizCode,
    setCode: setWizCode,
    codeVerifier: wizCodeVerifier,
    setCodeVerifier: setWizCodeVerifier,
    authUrl: wizAuthUrl,
    tokenResult: wizTokenResult,
    userinfoResult: wizUserinfoResult,
    introspectResult: wizIntrospectResult,
    /** `auth` is exposed so the wizard can disable the DCR button without re-deriving it. */
    hasAdminCredential: Boolean(auth),
    stepDiscover: wizStepDiscover,
    stepCimd: wizStepCimd,
    stepDcr: wizStepDcr,
    stepAuthorize: wizStepAuthorize,
    stepToken: wizStepToken,
    stepUserinfo: wizStepUserinfo,
    stepIntrospect: wizStepIntrospect,
  };
}

export type McpFlow = ReturnType<typeof useMcpFlow>;
