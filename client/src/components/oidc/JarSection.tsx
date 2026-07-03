import { useState } from 'react';
import { toast } from 'sonner';
import { processJar } from '@/services/jar.service';
import { generateSigningKeyPair, getJwkSetDisplay, type SigningKeyPair } from '@/services/client-assertion.service';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateTemplate(clientId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return JSON.stringify(
    {
      iss: clientId,
      aud: 'http://localhost:3000',
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'http://localhost:3001/callback',
      scope: 'openid profile',
      state: crypto.randomUUID().slice(0, 8),
      nonce: crypto.randomUUID().slice(0, 8),
      iat: now,
      nbf: now,
      exp: now + 300,
      jti: crypto.randomUUID(),
    },
    null,
    2,
  );
}

async function createRequestObject(
  privateKeyJwk: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk as any,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );

  const header = { alg: 'ES256', kid: privateKeyJwk.kid, typ: 'JWT' };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const message = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    message,
  );

  const rawSignature = new Uint8Array(signature);
  const encodedSignature = base64UrlEncode(rawSignature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

function JarSection() {
  const { loading, result, error, call } = useAsyncCall();
  const [keyPair, setKeyPair] = useState<SigningKeyPair | null>(null);
  const [claimsJson, setClaimsJson] = useState('');
  const [signedJwt, setSignedJwt] = useState('');
  const [clientId, setClientId] = useState('');
  const [jarResult, setJarResult] = useState<any>(null);

  const doc = getDoc('jar', 'process');

  const handleGenerateKey = async () => {
    try {
      const kp = await generateSigningKeyPair();
      setKeyPair(kp);
      const template = generateTemplate(kp.kid.slice(0, 8));
      setClaimsJson(template);
      setClientId(kp.kid.slice(0, 8));
      setSignedJwt('');
      setJarResult(null);
      toast.success('ES256 key pair generated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate key pair');
    }
  };

  const handleSign = async () => {
    if (!keyPair) {
      toast.error('Generate a key pair first');
      return;
    }
    try {
      const payload = JSON.parse(claimsJson);
      if (!payload.iss || !payload.aud || !payload.client_id) {
        toast.error('JWT must include iss, aud, and client_id claims');
        return;
      }
      const jwt = await createRequestObject(keyPair.privateKey, payload);
      setSignedJwt(jwt);
      setJarResult(null);
      toast.success('Request object signed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sign JWT');
    }
  };

  const handleProcess = async () => {
    if (!signedJwt) {
      toast.error('Sign a request object first');
      return;
    }
    if (!clientId) {
      toast.error('Enter a client ID');
      return;
    }

    const { data, error: err } = await call(() => processJar(signedJwt, clientId));
    if (data) {
      setJarResult(data);
      toast.success('JAR processed');
    } else {
      toast.error(err);
    }
  };

  const handleReset = () => {
    setKeyPair(null);
    setClaimsJson('');
    setSignedJwt('');
    setJarResult(null);
  };

  const canSign = !!keyPair && !!claimsJson;
  const canProcess = !!signedJwt && !!clientId;

  return (
    <SectionPanel
      title="JWT Secured Authorization Requests (RFC 9101)"
      description="Build, sign, and test JWT-secured authorization requests (JAR). Generate an ES256 key pair, craft the JWT claims, sign the request object, and send it to Authlete for validation."
    >
      {error && <p className="text-xs text-red-400">{String(error)}</p>}
      {doc && <OperationDescription doc={doc} />}

      <Card>
        <CardHeader>
          <CardTitle>1. Key Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-400">
            Generate an ES256 (ECDSA P-256) key pair. The public key must be registered in the Authlete Console
            under Client → JWK Set for Authlete to validate the JWT signature.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleGenerateKey} loading={loading} size="sm">
              Generate ES256 Key Pair
            </Button>
            {keyPair && (
              <Button variant="secondary" onClick={handleReset} size="sm">
                Reset
              </Button>
            )}
          </div>
          {keyPair && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-amber-400 mb-1">
                  Register this JWK Set in Authlete Console → Client → JWK Set Content
                </p>
                <Textarea
                  label="Public JWK Set"
                  rows={6}
                  value={getJwkSetDisplay(keyPair.publicKey)}
                  readOnly
                />
              </div>
              <JsonBlock
                data={{ ...keyPair.privateKey, d: '***present***' }}
                label="Private Key (JWK, redacted)"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>2. Build & Sign JWT</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-400">
            Edit the JWT claims below. Required claims: <code className="text-slate-300">iss</code> (client ID),
            <code className="text-slate-300"> aud</code> (Authlete service issuer URL),
            <code className="text-slate-300"> response_type</code>, <code className="text-slate-300"> client_id</code>,
            <code className="text-slate-300"> redirect_uri</code>. Include <code className="text-slate-300">exp</code>,
            <code className="text-slate-300"> nbf</code>, <code className="text-slate-300"> jti</code> for replay protection.
          </p>
          <Textarea
            label="JWT Claims (JSON)"
            rows={12}
            value={claimsJson}
            onChange={(e) => setClaimsJson(e.target.value)}
            placeholder='{"iss":"client-id","aud":"http://localhost:3000","response_type":"code",...}'
          />
          <div className="flex gap-2">
            <Button onClick={handleSign} loading={loading} size="sm" disabled={!canSign}>
              Sign Request Object
            </Button>
          </div>
          {signedJwt && (
            <div>
              <Textarea label="Signed Request Object (JWT)" rows={4} value={signedJwt} readOnly />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>3. Process JAR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-400">
            Send the signed request object to Authlete for validation. The response includes
            <code className="text-slate-300"> action</code>, <code className="text-slate-300"> ticket</code>,
            and the decoded <code className="text-slate-300"> requestObjectPayload</code>.
          </p>
          <Input
            label="Client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="your_client_id"
          />
          <Button onClick={handleProcess} loading={loading} disabled={!canProcess}>
            Process JAR
          </Button>
          {jarResult && (
            <div className="space-y-4">
              <JsonBlock data={jarResult} label="Authlete Response" />
              {jarResult.requestObjectPayload && (
                <JsonBlock
                  data={(() => {
                    try { return JSON.parse(jarResult.requestObjectPayload); }
                    catch { return jarResult.requestObjectPayload; }
                  })()}
                  label="Decoded requestObjectPayload"
                />
              )}
            </div>
          )}
          {result !== null && !jarResult && (
            <JsonBlock data={result} label="Response" />
          )}
        </CardContent>
      </Card>
    </SectionPanel>
  );
}

export { JarSection };
