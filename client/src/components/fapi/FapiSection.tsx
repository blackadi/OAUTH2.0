import { useState } from 'react';
import { toast } from 'sonner';
import { fapiService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
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
import { useToken } from '@/context/TokenContext';
import { TOKEN_ENDPOINT } from '@/config';
import { useFapiFlow } from './use-fapi-flow';
import { FapiTestFlow } from './FapiTestFlow';

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

  const flow = useFapiFlow();

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
  return (
    <SectionPanel
      title="FAPI 2.0 Security Profile"
      description="FAPI 2.0 Security Profile compliance and test flow with private_key_jwt client auth and DPoP sender-constrained tokens"
    >
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

      <FapiTestFlow flow={flow} />
    </SectionPanel>
  );
}

export { FapiSection };
