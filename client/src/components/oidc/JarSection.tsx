import { useState, useId } from 'react';
import { toast } from 'sonner';
import { processJar, type JarProcessResult } from '@/services/jar.service';
import {
  generateSigningKeyPair,
  getJwkSetDisplay,
  type SigningKeyPair,
} from '@/services/client-assertion.service';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { useCredentials } from '@/context/CredentialContext';
import { getDoc } from '@/data/operationDocs';
import { parseJsonObject } from '@/utils/parse-json';
import '@/styles/transcript.css';

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
  // `JsonWebKey` rather than `Record<string, unknown>`: a JWK has no index signature, so callers holding a
  // real key could not pass it. `crypto.subtle.importKey` wants exactly this type anyway.
  // `JsonWebKey` is what `crypto.subtle.importKey` wants; `kid` is a registered JWK member (RFC 7517 §4.5)
  // that the DOM lib's type happens to omit, so it is spelled out here rather than cast away.
  privateKeyJwk: JsonWebKey & { kid?: string },
  payload: Record<string, unknown>,
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
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

/**
 * RFC 9101 (JAR), rendered as the exchange it is — the same conversion `ParSection` and its siblings
 * had, adapted for the two steps here that are not an exchange at all. Key generation and signing are
 * local `crypto.subtle` calls with no server on the other end, so they are turns 1 and 2 labelled
 * **Local** rather than a channel direction; only turns 3 and 4 are the actual client/server pair.
 *
 * **Behaviour is unchanged.** Every handler below is the incumbent implementation; only the markup
 * around them changed.
 */
function JarSection() {
  const { loading, result, error, call } = useAsyncCall();
  const [keyPair, setKeyPair] = useState<SigningKeyPair | null>(null);
  const [claimsJson, setClaimsJson] = useState('');
  const [signedJwt, setSignedJwt] = useState('');
  const [clientId, setClientId] = useState('');
  const [jarResult, setJarResult] = useState<JarProcessResult | null>(null);

  const doc = getDoc('jar', 'process');
  const uid = useId();
  // Shared with every other admin section on the page, so entering them once is enough.
  const { clientId: authId, clientSecret: authSecret } = useCredentials();
  const auth = authId && authSecret ? btoa(`${authId}:${authSecret}`) : '';

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
      /**
       * RFC 9101 §4 requires the request object to carry `iss`, `aud` and `client_id`, and this is a
       * free-text editor — so the value genuinely may be anything, including not an object at all.
       * `JSON.parse` returned `any`, which made all three of those checks unchecked reads.
       */
      const payload = parseJsonObject(claimsJson);
      if (!payload) {
        toast.error('The claims are not a JSON object');
        return;
      }
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
    if (!auth) {
      toast.error('Enter the admin credentials — this endpoint requires them');
      return;
    }

    const { data, error: err } = await call(() => processJar(signedJwt, clientId, auth));
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
  const canProcess = !!signedJwt && !!clientId && !!auth;

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">JWT Secured Authorization Requests</h1>
        <span className="tx-ref">RFC 9101</span>
      </header>

      <p className="tx-standfirst">
        The authorization parameters travel inside a signed JWT instead of loose query parameters,
        so the server can verify who assembled the request and that nothing in it was altered in
        transit. Build the key, sign the object, then send it.
      </p>

      <div className="tx-body">
        {/* JAR errors are among the most cryptic on this deployment — `[A005328]` for a bad signature —
            and this was one of only two sections that showed the raw string and no explanation, while
            `AUTHLETE_NOTES` has an entry for exactly that code. */}
        {error && <ErrorExplainer error={String(error)} className="mb-3" />}
        {doc && (
          <OperationDescription
            doc={doc}
            className="tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0"
          />
        )}

        {/* ── Turn 1 ─────────────────────────────────────────────────────── */}
        <div className="tx-turn">
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">1 · Local — key pair</span>
            <span className="tx-turn-note">ES256 (ECDSA P-256), never leaves the browser</span>
          </div>

          <p className="tx-hint">
            The public key must be registered in the Authlete Console under Client → JWK Set for
            Authlete to validate the signature below.
          </p>
          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={() => void handleGenerateKey()}
            >
              {loading && !keyPair && <span className="tx-spin" aria-hidden="true" />}
              Generate ES256 Key Pair
            </button>
            {keyPair && (
              <button type="button" className="tx-btn" onClick={handleReset}>
                Reset
              </button>
            )}
          </div>
          {keyPair && (
            <div className="tx-row">
              <label className="tx-field" htmlFor={`${uid}-pubjwk`}>
                <span className="tx-label">Public JWK Set</span>
                <textarea
                  id={`${uid}-pubjwk`}
                  className="tx-textarea"
                  rows={6}
                  value={getJwkSetDisplay(keyPair.publicKey)}
                  readOnly
                />
              </label>
              <div className="tx-evidence" data-outcome="issued">
                <div className="tx-evidence-head">
                  <span className="tx-evidence-verdict">Private Key (JWK, redacted)</span>
                </div>
                <JsonBlock data={{ ...keyPair.privateKey, d: '***present***' }} />
              </div>
            </div>
          )}
        </div>

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        <div className="tx-turn" data-state={signedJwt ? 'landed' : 'pending'}>
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">2 · Local — sign</span>
          </div>

          <p className="tx-hint">
            Required claims: <code>iss</code> (client ID), <code>aud</code> (Authlete service issuer
            URL), <code>response_type</code>, <code>client_id</code>, <code>redirect_uri</code>.
            Include <code>exp</code>, <code>nbf</code>, <code>jti</code> for replay protection.
          </p>
          <label className="tx-field" htmlFor={`${uid}-claims`}>
            <span className="tx-label">JWT Claims (JSON)</span>
            <textarea
              id={`${uid}-claims`}
              className="tx-textarea"
              rows={12}
              value={claimsJson}
              onChange={(e) => setClaimsJson(e.target.value)}
              placeholder='{"iss":"client-id","aud":"http://localhost:3000","response_type":"code",...}'
            />
          </label>
          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={() => void handleSign()}
              disabled={!canSign}
            >
              Sign Request Object
            </button>
          </div>
          {signedJwt && (
            <label className="tx-field" htmlFor={`${uid}-signed`}>
              <span className="tx-label">Signed Request Object (JWT)</span>
              <textarea
                id={`${uid}-signed`}
                className="tx-textarea"
                rows={4}
                value={signedJwt}
                readOnly
              />
            </label>
          )}
        </div>

        {/* ── Turn 3 ─────────────────────────────────────────────────────── */}
        <div className="tx-turn" data-dir="out">
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">3 · Client → Server</span>
            <span className="tx-turn-note">POST /api/jar/process</span>
          </div>

          <p className="tx-hint">
            Admin credentials are required here, and the reason is a field you will <em>not</em> see
            below: Authlete&apos;s authorization response carries a <code>ticket</code>, and a
            ticket is a credential — whoever holds one can drive an authorization to completion. The
            endpoint drops it, and no longer answers anonymous callers at all.
          </p>
          <AdminAuth />
          <label className="tx-field" htmlFor={`${uid}-cid`}>
            <span className="tx-label">Client ID</span>
            <input
              id={`${uid}-cid`}
              className="tx-input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="your_client_id"
            />
          </label>
          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={() => void handleProcess()}
              disabled={!canProcess}
            >
              {loading && !!keyPair && <span className="tx-spin" aria-hidden="true" />}
              Process Request
            </button>
          </div>
        </div>

        {/* ── Turn 4 ─────────────────────────────────────────────────────── */}
        <div
          className="tx-turn"
          data-dir={jarResult || result ? 'in' : undefined}
          data-state={jarResult || result ? 'landed' : 'pending'}
        >
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">4 · Server → Client</span>
          </div>

          {/*
            `requestObjectPayload` used to be decoded and rendered here. It can no longer arrive: since
            2026-08-13 the endpoint returns a five-field allowlist, because the full Authlete response
            carried a `ticket` — a credential — and this panel was the reason nobody noticed the rest of
            it was being shipped to the browser too. `resultMessage` and `scopes` are the pedagogical
            payload now, and both are inside `jarResult`.
          */}
          {jarResult ? (
            <JsonBlock data={jarResult} label="Authlete Response" />
          ) : result !== null ? (
            <JsonBlock data={result} label="Response" />
          ) : (
            <div className="tx-waiting">
              The response is a five-field allowlist — <code>action</code>, <code>resultCode</code>,{' '}
              <code>resultMessage</code>, <code>responseContent</code> and <code>scopes</code>.
              Nothing is sent until you process a signed request object.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export { JarSection };
