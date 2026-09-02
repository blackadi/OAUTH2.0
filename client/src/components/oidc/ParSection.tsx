import { useState, useCallback, useMemo, useId } from 'react';
import { toast } from 'sonner';
import { parService } from '@/services';
import type { ParSuccessResponse } from '@/services/par.service';
import { AUTHORIZATION_ENDPOINT, PAR_ENDPOINT } from '@/config';
import { createPkcePair } from '@/pkce';
import { generateKeyPair, createProof } from '@/services/dpop.service';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { SESSION_KEYS, readKey, readJsonKey, writeKey } from '@/services/session-keys';
import { navigateTo } from '@/services/trace-store';
import type { JWK } from '@/services/crypto-utils';
import '@/styles/transcript.css';

/**
 * PAR, rendered as the exchange it is.
 *
 * **What changed and why.** This section used to be the same shape as the other twelve: a
 * `SectionPanel`, a stack of boxed fields, a row of filled buttons, and a `JsonBlock` underneath. That
 * shape is the one thing that hides what PAR is *for* — pushing the request out of the front channel, so
 * the browser carries a reference instead of the parameters. A form-then-dump says nothing about a
 * two-party exchange with a strict order, and the order is the security argument.
 *
 * So the section is a transcript. Turns run down a spine: you compose the outbound turn, the server's
 * reply lands below it, and the front-channel hop is a third turn you can see coming before it exists.
 *
 * **Colour is evidence, never chrome.** No control on this surface is filled or tinted. Affordance is
 * rule weight and ink; every coloured pixel means the server said something, and the hue says whether it
 * issued or refused. That is why the primary action is a shadowed outline rather than a gradient — in a
 * debugger, the brightest thing on screen should not be your own submit button.
 *
 * **Behaviour is unchanged.** Every handler, service call, DPoP path, session key, announcement and
 * trace entry below is the incumbent implementation. This is a presentation rewrite; if it changed what
 * the section *does*, it would be a different review.
 */
function ParSection() {
  const { loading, result, error, call } = useAsyncCall();
  const [parameters, setParameters] = useState(
    'response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3001/callback&scope=openid&state=par_state&code_challenge_method=S256&code_challenge=',
  );
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  // Must match the client's registered auth method — Authlete checks the channel the
  // credentials arrive on, so the wrong choice is a 401. 'post' is the historical default
  // here and what Authlete gives DCR-created clients.
  const [authMethod, setAuthMethod] = useState<'post' | 'basic' | 'none'>('post');
  const [useDpop, setUseDpop] = useState(false);
  // Mirrors RFC 9126 §2.2's response body. The server returned Authlete's camelCase envelope until T1-11.
  const [parResult, setParResult] = useState<ParSuccessResponse | null>(null);
  // Read once, lazily, at first render. This used to be an empty `useState` plus a mount effect that called
  // `setPkceVerifier` synchronously — which is a cascading render for a value that is known before the first
  // paint, and which `react-hooks` flags. Lazy initialisation is the same read with no second render.
  const [pkceVerifier, setPkceVerifier] = useState(() => readKey(SESSION_KEYS.pkceVerifier) ?? '');

  // `useId` rather than hand-written ids: this section renders once per route today, but a hardcoded
  // `for`/`id` pair is a duplicate-id bug the moment it does not.
  const uid = useId();
  const doc = getDoc('par', 'create');

  const handleGeneratePkce = useCallback(async () => {
    try {
      const pair = await createPkcePair();
      writeKey(SESSION_KEYS.pkceVerifier, pair.codeVerifier);
      setPkceVerifier(pair.codeVerifier);
      const state = crypto.randomUUID();
      writeKey(SESSION_KEYS.oauthState, state);
      const params = new URLSearchParams();
      params.set('response_type', 'code');
      params.set('redirect_uri', 'http://localhost:3001/callback');
      params.set('scope', 'openid');
      params.set('state', state);
      params.set('code_challenge_method', 'S256');
      params.set('code_challenge', pair.codeChallenge);
      setParameters(params.toString());
      toast.success('PKCE + state generated and stored');
    } catch {
      toast.error('Failed to generate PKCE');
    }
  }, []);

  const doParRequest = async () => {
    // basic -> Authorization: Basic header; post -> credentials in the JSON body, which the
    // server merges into the pushed `parameters`; none -> client_id only (public client).
    const basicAuth = authMethod === 'basic' && clientId ? { clientId, clientSecret } : undefined;
    // With Basic the secret travels in the header, so keep it out of the body entirely.
    const body =
      authMethod === 'basic'
        ? { parameters }
        : authMethod === 'none'
          ? { parameters, clientId }
          : { parameters, clientId, clientSecret };

    if (useDpop) {
      // Mint a key if this session has none. The value is read back below rather than threaded through
      // a local, so there is one read path whether the key was just generated or already stored.
      if (!readKey(SESSION_KEYS.dpopPrivateKey)) {
        const pair = await generateKeyPair();
        writeKey(SESSION_KEYS.dpopPrivateKey, JSON.stringify(pair.privateKey));
        writeKey(SESSION_KEYS.dpopPublicKey, JSON.stringify(pair.publicKey));
        writeKey(SESSION_KEYS.dpopKid, pair.kid);
      }
      /**
       * Read as a typed JWK. This was `JSON.parse(dpopKeyRaw)` — `any` — flowing straight into
       * `crypto.subtle.importKey` as a **signing key**, so the compiler checked nothing about the most
       * sensitive argument in the call. `readJsonKey` also returns `null` on a corrupted entry rather
       * than throwing, which is the difference between "no key" and an unexplained failure.
       */
      const dpopPrivateKey = readJsonKey<JWK>(SESSION_KEYS.dpopPrivateKey);
      if (!dpopPrivateKey) {
        toast.error('The stored DPoP key is unreadable. Generate a new one in Grant Flows.');
        return null;
      }
      // A factory, not a proof: the nonce is inside the signature, so a `use_dpop_nonce` retry needs a
      // fresh one. `dpopRequest` owns reading and storing `dpop_nonce`.
      const { data } = await parService.pushedAuthorizationWithDpop(
        body,
        (nonce) => createProof(dpopPrivateKey, 'POST', PAR_ENDPOINT, undefined, nonce),
        basicAuth,
      );
      return data;
    }
    return parService.pushedAuthorization(body, basicAuth);
  };

  const handlePush = async () => {
    const { data, error: err } = await call(doParRequest);
    if (data) {
      const d = data as ParSuccessResponse;
      setParResult(d);
      toast.success('PAR request completed');
    } else {
      toast.error(err);
    }
  };

  const handlePushAndRedirect = async () => {
    const { data, error: err } = await call(doParRequest);
    if (data) {
      // RFC 9126 §2.2 names this `request_uri`. The server used to hand back Authlete's camelCase
      // `requestUri` inside its envelope; T1-11 made the response the specification's body.
      const d = data as ParSuccessResponse;
      if (d?.request_uri) {
        const cid = clientId || parameters.match(/client_id=([^&]+)/)?.[1] || '';
        navigateTo(
          `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(cid)}&request_uri=${encodeURIComponent(d.request_uri)}`,
          'authorize (PAR) — front channel, browser leaves with the request_uri',
        );
      }
    } else {
      toast.error(err);
    }
  };

  // `authUrl` is a pure function of three values already in scope, so it is computed during render rather
  // than mirrored into state by an effect. The effect version wrote state on every change of its
  // dependencies, which renders twice for a string that was derivable the first time.
  const authUrl = useMemo(() => {
    const cid = clientId || parameters.match(/client_id=([^&]+)/)?.[1] || '';
    if (!parResult?.request_uri || !cid) return '';
    return `${AUTHORIZATION_ENDPOINT}?client_id=${encodeURIComponent(cid)}&request_uri=${encodeURIComponent(parResult.request_uri)}`;
  }, [parResult, clientId, parameters]);

  const handleRedirectToAuthorize = () => {
    if (authUrl)
      navigateTo(authUrl, 'authorize (PAR) — front channel, browser leaves with the request_uri');
  };

  // `authUrl` is derived, so clearing `parResult` clears it too — there is nothing else to reset.
  const handleReset = () => {
    setParResult(null);
  };

  const pushed = Boolean(parResult?.request_uri);

  return (
    <section className="tx">
      <header className="tx-masthead">
        {/* `h1` for the same reason the incumbent `SectionPanel` used one: this is the title of the page
            the route renders, and it was the only heading on it. */}
        <h1 className="tx-title">Pushed Authorization Request</h1>
        <span className="tx-ref">RFC 9126</span>
      </header>

      <p className="tx-standfirst">
        The client hands its authorization parameters to the server over the back channel and gets a
        reference. The browser then carries only that reference, so the request cannot be inspected
        or tampered with in the address bar.
      </p>

      <div className="tx-body">
        {error && <ErrorExplainer error={error} className="mb-3" />}
        {/* The Tailwind utilities are here so `twMerge` drops the component's own accent classes;
            `tx-doc` carries the rest. Without them the incumbent tint wins the merge. */}
        {doc && (
          <OperationDescription
            doc={doc}
            className="tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0"
          />
        )}

        {/* ── Turn 1 ─────────────────────────────────────────────────────── */}
        <div className="tx-turn" data-dir="out">
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">1 · Client → Server</span>
            <span className="tx-turn-note">POST {PAR_ENDPOINT}</span>
          </div>

          <label className="tx-field">
            <span className="tx-label">Parameters (URL-encoded)</span>
            <textarea
              className="tx-textarea"
              rows={4}
              value={parameters}
              onChange={(e) => setParameters(e.target.value)}
              placeholder="response_type=code&client_id=…&redirect_uri=…&scope=openid&code_challenge=…"
            />
          </label>

          <div className="tx-actions" style={{ marginTop: '0.25rem', marginBottom: '1rem' }}>
            <button type="button" className="tx-btn" onClick={handleGeneratePkce}>
              Generate PKCE + state
            </button>
            {pkceVerifier && (
              <span className="tx-turn-note" title={pkceVerifier}>
                verifier {pkceVerifier.slice(0, 12)}…
              </span>
            )}
          </div>

          <div className="tx-row">
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

            {authMethod !== 'none' && (
              <label className="tx-field" htmlFor={`${uid}-secret`}>
                <span className="tx-label">Client Secret</span>
                <input
                  id={`${uid}-secret`}
                  className="tx-input"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="your_client_secret"
                />
              </label>
            )}
          </div>

          <label className="tx-field" htmlFor={`${uid}-auth`}>
            <span className="tx-label">Client Auth Method</span>
            <select
              id={`${uid}-auth`}
              className="tx-select"
              value={authMethod}
              onChange={(e) => setAuthMethod(e.target.value as 'post' | 'basic' | 'none')}
              aria-describedby={`${uid}-auth-hint`}
            >
              <option value="post">client_secret_post — credentials in body</option>
              <option value="basic">client_secret_basic — Authorization header</option>
              <option value="none">none — public client (PKCE required)</option>
            </select>
            <p className="tx-hint" id={`${uid}-auth-hint`}>
              Must match the client&apos;s registered method. Authlete checks which channel the
              credentials arrive on and returns 401 on a mismatch.
            </p>
          </label>

          <label className="tx-check">
            <input
              type="checkbox"
              checked={useDpop}
              onChange={(e) => setUseDpop(e.target.checked)}
            />
            Use DPoP (sender-constrained token binding)
          </label>

          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={handlePush}
              disabled={loading}
            >
              {loading && <span className="tx-spin" aria-hidden="true" />}
              {loading ? 'Pushing…' : 'Push Authorization Request'}
            </button>
            {pushed && (
              <button
                type="button"
                className="tx-btn"
                onClick={handlePushAndRedirect}
                disabled={loading}
              >
                Push + Authorize
              </button>
            )}
          </div>
        </div>

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        <div
          className="tx-turn"
          data-dir={pushed ? 'in' : undefined}
          data-state={pushed ? 'landed' : 'pending'}
        >
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">2 · Server → Client</span>
            {pushed && <span className="tx-turn-note">201 Created</span>}
          </div>

          {pushed && parResult ? (
            <div className="tx-evidence tx-lands" data-outcome="issued">
              <div className="tx-evidence-head">
                <span className="tx-evidence-verdict">Request URI issued</span>
                <span className="tx-turn-note">expires in {parResult.expires_in ?? '~600'}s</span>
              </div>
              <span className="tx-datum">
                <span className="tx-datum-key">request_uri</span>
                <span className="tx-datum-value">{parResult.request_uri}</span>
              </span>
              {authUrl && (
                <span className="tx-datum">
                  <span className="tx-datum-key">Front-channel URL</span>
                  <span className="tx-datum-value">
                    <a href={authUrl} target="_blank" rel="noopener noreferrer">
                      {authUrl}
                    </a>
                  </span>
                </span>
              )}
            </div>
          ) : (
            /* The waiting state is the same shape the answer will occupy, so nothing jumps when it
               lands — and it names what is coming rather than leaving a void. */
            <div className="tx-waiting">
              The server will answer with a <code>request_uri</code> and the seconds it stays valid.
              Nothing is sent until you push.
            </div>
          )}
        </div>

        {/* ── Turn 3 ─────────────────────────────────────────────────────── */}
        <div className="tx-turn" data-state={pushed ? 'landed' : 'pending'}>
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">3 · Browser → Server</span>
            <span className="tx-turn-note">front channel</span>
          </div>

          {pushed ? (
            <div className="tx-actions" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="tx-btn tx-btn-primary"
                onClick={handleRedirectToAuthorize}
              >
                Authorize (redirect)
              </button>
              <button type="button" className="tx-btn" onClick={handleReset}>
                Clear
              </button>
            </div>
          ) : (
            <div className="tx-waiting">
              You leave the application here, carrying only the reference. The parameters stay on
              the server.
            </div>
          )}
        </div>

        {/* The raw body stays available — it is the evidence, and the summary above is a reading of it,
            not a replacement for it. */}
        {result !== null && !parResult && <JsonBlock data={result} label="Response" />}
        {parResult && <JsonBlock data={parResult} label="PAR Response" />}
      </div>
    </section>
  );
}

export { ParSection };
