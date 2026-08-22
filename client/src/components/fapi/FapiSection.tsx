import { useState } from 'react';
import { toast } from 'sonner';
import { fapiService, parService, tokenService } from '@/services';
import type { ParSuccessResponse } from '@/services/par.service';
import { useAsyncCall, useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import {
  generateKeyPair,
  createProof,
  computeAth,
  type DPoPKeyPair,
} from '@/services/dpop.service';
import {
  generateSigningKeyPair,
  createClientAssertion,
  getJwkSetDisplay,
  type SigningKeyPair,
} from '@/services/client-assertion.service';
import { useToken } from '@/context/TokenContext';
import {
  CLIENT_ID,
  DEFAULT_SCOPES,
  PAR_ENDPOINT,
  AUTHORIZATION_ENDPOINT,
  USERINFO_ENDPOINT,
  TOKEN_ENDPOINT,
  getRedirectUri,
} from '@/config';
import { createPkcePair } from '@/pkce';
import { SESSION_KEYS, writeKey } from '@/services/session-keys';

// Mirrors GET /api/fapi/config. Every field is read from the live Authlete service — six of these used
// to be hardcoded server-side, and all six were the opposite of the real configuration.
interface FapiConfig {
  mode: string;
  /** The service's `dpopNonceRequired` flag, not "is DPoP available". */
  dpopEnabled: boolean;
  /** What the service permits. Which method a client must use is pinned per client. */
  supportedTokenAuthMethods: string[];
  /** mTLS binding (`tlsClientCertificateBoundAccessTokens`). DPoP binding is per-client. */
  certificateBoundAccessTokens: boolean;
  parRequired: boolean;
  pkceRequired: boolean;
  /** Derived from `refreshTokenKept === false` — a kept token is one that is *not* rotated. */
  refreshTokenRotation: boolean;
  scopeRequired: boolean;
  cimdSupported: boolean;
}

// Mirrors the server's `FapiModeSummary` (`fapi.controller.ts`). It spans both FAPI generations because
// Authlete's `fapiModes` does — the server used to report a FAPI 1.0 service as "disabled" (FAPI1-W2).
// `disabled` (no mode set) and `unknown` (a mode set that the server does not recognise) are distinct
// states and are shown differently on purpose.
const FAPI_MODE_BADGES: Record<string, { label: string; variant: 'success' | 'info' | 'warning' }> =
  {
    sp: { label: 'FAPI 2.0 Security Profile', variant: 'success' },
    ms: { label: 'FAPI 2.0 + Message Signing', variant: 'success' },
    'fapi1-advanced': { label: 'FAPI 1.0 Advanced', variant: 'success' },
    'fapi1-baseline': { label: 'FAPI 1.0 Baseline', variant: 'success' },
    unknown: { label: 'FAPI mode unrecognised', variant: 'warning' },
    disabled: { label: 'FAPI Disabled', variant: 'info' },
  };

function FapiSection() {
  const { loading, error, call } = useAsyncCall();
  const { getAccessToken } = useToken();

  const [configData, setConfigData] = useState<FapiConfig | null>(null);
  const [statusData, setStatusData] = useState<Record<string, unknown> | null>(null);

  const [keyPair, setKeyPair] = useState<DPoPKeyPair | null>(null);
  const [proofHtm, setProofHtm] = useState('POST');
  // Derived from configuration rather than hardcoded: the previous default was
  // `http://localhost:3000/api/token`, which is wrong in every deployed environment and produces a
  // proof whose `htu` cannot match the request.
  const [proofHtu, setProofHtu] = useState(TOKEN_ENDPOINT);
  const [proofAt, setProofAt] = useState('');
  const [proofNonce, setProofNonce] = useState('');
  const [proofJwt, setProofJwt] = useState('');

  // Wizard state
  const [wizClientId, setWizClientId] = useState(CLIENT_ID);
  const [wizRedirectUri, setWizRedirectUri] = useState(getRedirectUri());
  const [wizScopes, setWizScopes] = useState(DEFAULT_SCOPES);
  const [wizDpopKeyPair, setWizDpopKeyPair] = useState<DPoPKeyPair | null>(null);
  const [wizSigningKey, setWizSigningKey] = useState<SigningKeyPair | null>(null);
  /**
   * Typed by `ParSuccessResponse`, not by an inline shape — and that is the fix, not a tidy-up.
   *
   * This held `{ requestUri?: string; expiresIn?: number }` and cast the response to it. T1-11 made
   * `POST /api/par` answer with RFC 9126 §2.2's body, whose members are `request_uri` and `expires_in`,
   * so `requestUri` became permanently `undefined` — and step 4's handler opens with
   * `if (!wizParResult?.requestUri) return`, which made the Authorize button *enabled and inert*: no
   * redirect, no error, while the panel above it displayed the `request_uri` it refused to use.
   * `RarSection` had exactly this bug and `ParSuccessResponse` exists so the rename is a compile error.
   * A local `as { … }` cast is how a shared type gets bypassed — the lesson worth keeping.
   */
  const [wizParResult, setWizParResult] = useState<ParSuccessResponse | null>(null);
  const [wizUserinfoResult, setWizUserinfoResult] = useState<Record<string, unknown> | null>(null);
  const wizAsync = useDiscriminatedAsyncCall<string>();
  const { loading: wizLoading, error: wizError, call: wizCall } = wizAsync;

  const configDoc = getDoc('fapi', 'config');
  const statusDoc = getDoc('fapi', 'status');

  const fetchConfig = async () => {
    const { data } = await call(() => fapiService.getConfig());
    if (data) {
      setConfigData(data as FapiConfig);
      toast.success('FAPI config loaded');
    }
  };

  const fetchStatus = async () => {
    const { data } = await call(() => fapiService.getStatus());
    if (data) {
      setStatusData(data as Record<string, unknown>);
      toast.success('FAPI status loaded');
    }
  };

  const handleGenerateKey = async () => {
    try {
      const kp = await generateKeyPair();
      setKeyPair(kp);
      toast.success('DPoP key pair generated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate key pair');
    }
  };

  const handleCreateProof = async () => {
    if (!keyPair) {
      toast.error('Generate a DPoP key pair first');
      return;
    }
    try {
      const jwt = await createProof(
        keyPair.privateKey,
        proofHtm,
        proofHtu,
        proofAt || undefined,
        proofNonce || undefined,
      );
      setProofJwt(jwt);
      toast.success('DPoP proof created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create proof');
    }
  };

  const handleWizGenerateDpopKey = async () => {
    const { error } = await wizCall('setup', async () => {
      const kp = await generateKeyPair();
      writeKey(SESSION_KEYS.dpopPrivateKey, JSON.stringify(kp.privateKey));
      writeKey(SESSION_KEYS.dpopPublicKey, JSON.stringify(kp.publicKey));
      writeKey(SESSION_KEYS.dpopKid, kp.kid);
      writeKey(SESSION_KEYS.authzClientId, wizClientId);
      setWizDpopKeyPair(kp);
    });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('DPoP key pair generated');
  };

  const handleWizGenerateSigningKey = async () => {
    const { error } = await wizCall('setup', async () => {
      const sk = await generateSigningKeyPair();
      writeKey(SESSION_KEYS.fapiSigningKey, JSON.stringify(sk.privateKey));
      writeKey(SESSION_KEYS.fapiSigningPublicKey, JSON.stringify(sk.publicKey));
      setWizSigningKey(sk);
    });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Client auth signing key pair generated');
  };

  const handleWizPar = async () => {
    if (!wizDpopKeyPair || !wizSigningKey) return;
    const { error } = await wizCall('par', async () => {
      const pkce = await createPkcePair();
      writeKey(SESSION_KEYS.pkceVerifier, pkce.codeVerifier);
      const state = crypto.randomUUID();
      writeKey(SESSION_KEYS.oauthState, state);

      const clientAssertion = await createClientAssertion(
        wizSigningKey.privateKey,
        wizClientId,
        TOKEN_ENDPOINT,
      );

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: wizClientId,
        redirect_uri: wizRedirectUri,
        scope: wizScopes,
        code_challenge: pkce.codeChallenge,
        code_challenge_method: 'S256',
        state,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: clientAssertion,
      });

      const { data } = await parService.pushedAuthorizationWithDpop(
        { parameters: params.toString() },
        // A factory, not a proof: a `use_dpop_nonce` retry needs a fresh signature, and `dpopRequest`
        // owns the `dpop_nonce` store.
        (nonce) => createProof(wizDpopKeyPair.privateKey, 'POST', PAR_ENDPOINT, undefined, nonce),
      );
      setWizParResult(data as ParSuccessResponse);
    });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('PAR succeeded');
  };

  const handleWizAuthorize = () => {
    if (!wizParResult?.request_uri) return;
    const authorizeUrl = `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(wizClientId)}&request_uri=${encodeURIComponent(wizParResult.request_uri)}`;
    window.location.href = authorizeUrl;
  };

  const handleWizUserinfo = async () => {
    const { error } = await wizCall('userinfo', async () => {
      const accessToken = getAccessToken();
      if (!accessToken)
        throw new Error('No access token stored in context. Complete the authorize step first.');
      const athValue = await computeAth(accessToken);
      const { data } = await tokenService.userInfoWithDpop(accessToken, (nonce) =>
        createProof(wizDpopKeyPair!.privateKey, 'POST', USERINFO_ENDPOINT, athValue, nonce),
      );
      setWizUserinfoResult(data as Record<string, unknown>);
    });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Userinfo fetched with DPoP');
  };

  const accessToken = getAccessToken();
  const wizHasToken = !!accessToken;

  return (
    <SectionPanel
      title="FAPI 2.0 Security Profile"
      description="FAPI 2.0 Security Profile compliance and test flow with private_key_jwt client auth and DPoP sender-constrained tokens"
    >
      {!!error && <p className="text-xs text-danger-text">{String(error)}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>FAPI Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && <ErrorExplainer error={String(error)} className="mb-3" />}
            {configDoc && <OperationDescription doc={configDoc} />}
            <Button onClick={fetchConfig} loading={loading} size="sm">
              Fetch Config
            </Button>
            {configData != null && (
              <div className="flex flex-wrap gap-2 mt-2">
                {(() => {
                  const badge = FAPI_MODE_BADGES[configData.mode];
                  // An unrecognised mode is NOT a disabled one. The server stopped collapsing the two
                  // (FAPI1-W2) and this badge must not put them back together.
                  return badge ? (
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  ) : (
                    <Badge variant="warning">FAPI mode: {configData.mode}</Badge>
                  );
                })()}
                {configData.dpopEnabled ? (
                  <Badge variant="success">DPoP Enabled</Badge>
                ) : (
                  <Badge variant="info">DPoP Disabled</Badge>
                )}
                {configData.cimdSupported ? (
                  <Badge variant="success">CIMD Enabled</Badge>
                ) : (
                  <Badge variant="info">CIMD Disabled</Badge>
                )}
              </div>
            )}
            {configData ? <JsonBlock data={configData} label="Config" /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Authlete Live Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusDoc && <OperationDescription doc={statusDoc} />}
            <Button onClick={fetchStatus} loading={loading} size="sm">
              Fetch Status
            </Button>
            {statusData ? <JsonBlock data={statusData} label="Status" /> : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>DPoP Key Utilities</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Standalone DPoP proof generation for testing with any endpoint. For the full FAPI flow,
            use the wizard below.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Button onClick={handleGenerateKey} loading={loading} size="sm">
              Generate DPoP Key Pair (ES256)
            </Button>
          </div>

          {keyPair && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <JsonBlock data={keyPair.publicKey} label="Public Key (JWK)" />
                <JsonBlock
                  data={{ ...keyPair.privateKey, d: '***present***' }}
                  label="Private Key (JWK, redacted)"
                />
              </div>

              <div className="border-t border-border pt-4">
                <h2 className="text-sm font-medium mb-3">Create DPoP Proof</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="HTTP Method (htm)"
                    value={proofHtm}
                    onChange={(e) => setProofHtm(e.target.value)}
                    placeholder="POST"
                  />
                  <Input
                    label="HTTP URI (htu)"
                    value={proofHtu}
                    onChange={(e) => setProofHtu(e.target.value)}
                    placeholder="http://localhost:3000/api/token"
                  />
                  <Input
                    label="ath (optional)"
                    value={proofAt}
                    onChange={(e) => setProofAt(e.target.value)}
                    placeholder="base64url SHA-256 hash of access token"
                  />
                  <Input
                    label="Nonce (optional)"
                    value={proofNonce}
                    onChange={(e) => setProofNonce(e.target.value)}
                    placeholder="server DPoP-Nonce"
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    onClick={async () => {
                      const at = getAccessToken();
                      if (!at) {
                        toast.error('No access token stored - get a token first');
                        return;
                      }
                      const ath = await computeAth(at);
                      setProofAt(ath);
                      toast.success('ath computed from current access token');
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    Compute ath from Token
                  </Button>
                  <Button onClick={handleCreateProof} loading={loading} size="sm">
                    Create DPoP Proof JWT
                  </Button>
                </div>
                {proofJwt && (
                  <div className="mt-3">
                    <Textarea label="DPoP Proof JWT" rows={3} value={proofJwt} readOnly />
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
          {!!wizError && <ErrorExplainer error={String(wizError)} />}

          <div>
            <h2 className="text-sm font-medium mb-3">Setup: Client Configuration</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Input
                label="Client ID"
                value={wizClientId}
                onChange={(e) => setWizClientId(e.target.value)}
                placeholder="your_client_id"
              />
              <Input
                label="Redirect URI"
                value={wizRedirectUri}
                onChange={(e) => setWizRedirectUri(e.target.value)}
                placeholder="http://localhost:3001/callback"
              />
              <Input
                label="Scopes (incl. fapi2=sp scope)"
                value={wizScopes}
                onChange={(e) => setWizScopes(e.target.value)}
                placeholder="fapi_scope openid"
              />
            </div>
            <p className="text-xs text-muted-foreground/70 mb-3">
              Make sure your Authlete service has a scope with the{' '}
              <code className="text-muted-foreground">fapi2=sp</code> attribute and your client uses{' '}
              <code className="text-muted-foreground">PRIVATE_KEY_JWT</code> auth method.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleWizGenerateSigningKey}
                loading={wizLoading === 'setup'}
                size="sm"
                disabled={!!wizSigningKey}
              >
                Generate Client Auth Key
              </Button>
              <Button
                onClick={handleWizGenerateDpopKey}
                loading={wizLoading === 'setup'}
                size="sm"
                disabled={!!wizDpopKeyPair}
              >
                Generate DPoP Key
              </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
              {wizSigningKey && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Register this JWK in Authlete Console → Client → JWK Set. Delete any existing
                    key.
                  </p>
                  <Textarea
                    label="Client Auth Public Key (JWK Set)"
                    rows={6}
                    value={getJwkSetDisplay(wizSigningKey.publicKey)}
                    readOnly
                  />
                </div>
              )}
              {wizDpopKeyPair && (
                <JsonBlock data={wizDpopKeyPair.publicKey} label="DPoP Public Key (JWK)" />
              )}
            </div>
          </div>

          <div
            className={`border-t border-border pt-4 ${!wizDpopKeyPair || !wizSigningKey ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <h2 className="text-sm font-medium mb-2">Step 1: Push Authorization Request (PAR)</h2>
            <p className="text-xs text-muted-foreground mb-2">
              Pushes authorization parameters with a{' '}
              <code className="text-foreground-muted">private_key_jwt</code> client assertion and
              DPoP proof. Also generates PKCE challenge and state.
            </p>
            <Button
              onClick={handleWizPar}
              loading={wizLoading === 'par'}
              size="sm"
              disabled={!wizDpopKeyPair || !wizSigningKey}
            >
              Push PAR
            </Button>
            {wizParResult && (
              <div className="mt-2">
                <JsonBlock data={wizParResult} label="PAR Response" />
              </div>
            )}
          </div>

          <div
            className={`border-t border-border pt-4 ${!wizParResult?.request_uri ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <h2 className="text-sm font-medium mb-2">Step 2: Authorize</h2>
            <p className="text-xs text-muted-foreground mb-2">
              Opens the authorization page. After login + consent, you are redirected to the
              callback page where the code is exchanged for tokens using{' '}
              <code className="text-foreground-muted">private_key_jwt</code> + DPoP. Navigate back
              here for Step 3.
            </p>
            <Button
              onClick={handleWizAuthorize}
              size="sm"
              variant="secondary"
              disabled={!wizParResult?.request_uri}
            >
              Open Authorize Page
            </Button>
          </div>

          <div className={`border-t border-border pt-4`}>
            <h2 className="text-sm font-medium mb-2">Step 3: Call Userinfo with DPoP</h2>
            <p className="text-xs text-muted-foreground mb-2">
              Uses the stored DPoP key and access token from the callback. The DPoP proof includes
              the <code className="text-foreground-muted">ath</code> claim (hash of the access
              token).
            </p>
            <Button
              onClick={handleWizUserinfo}
              loading={wizLoading === 'userinfo'}
              size="sm"
              disabled={!wizHasToken}
            >
              Call Userinfo with DPoP
            </Button>
            {!wizHasToken && (
              <p className="text-xs text-warning-text mt-1">
                No access token found. Complete Step 2 first.
              </p>
            )}
            {wizUserinfoResult && (
              <div className="mt-2">
                <JsonBlock data={wizUserinfoResult} label="Userinfo Response" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </SectionPanel>
  );
}

export { FapiSection };
