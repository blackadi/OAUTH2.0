import { useState, useId } from 'react';
import { toast } from 'sonner';
import { ShieldAlert, GraduationCap } from 'lucide-react';
import { TOKEN_ENDPOINT, CLIENT_ID, CLIENT_SECRET } from '@/config';
import { useToken } from '@/context/TokenContext';
import { tokenExchangeService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { RequestBuilder } from '@/components/ui/RequestBuilder';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import type { TokenResponse } from '@/types';
import '@/styles/transcript.css';

/**
 * RFC 8693 Token Exchange, rendered as the exchange it is — the same conversion `ParSection`,
 * `StepUpSection`, `CibaSection` and `DeviceSection` had.
 *
 * **The three deliberate defects are surfaced, not hidden.** They are *taught*, and this repo's rule is
 * that fixing them silently breaks a lab. A section that quietly worked around them would teach the
 * opposite of what Module 06 teaches, so the response turn names each one where it appears and says it
 * is intentional. Citations verified against RFC 8693 §2.1 and §2.2.1 on 2026-08-22.
 *
 * **Behaviour is unchanged.** `exchange`, `deliberateGaps` and the conditional `actor_token_type` rule
 * are the incumbent implementation verbatim; only the markup around them changed.
 */

/** RFC 8693 §3 token type identifiers. */
const TOKEN_TYPES = [
  'urn:ietf:params:oauth:token-type:access_token',
  'urn:ietf:params:oauth:token-type:refresh_token',
  'urn:ietf:params:oauth:token-type:id_token',
  'urn:ietf:params:oauth:token-type:jwt',
  'urn:ietf:params:oauth:token-type:saml2',
];

function TokenExchangeSection() {
  const { tokenSet } = useToken();
  const { loading, result, error, call } = useAsyncCall<TokenResponse>();
  const doc = getDoc('token-ops', 'exchange');
  const uid = useId();

  const [subjectToken, setSubjectToken] = useState(tokenSet?.access_token ?? '');
  const [subjectTokenType, setSubjectTokenType] = useState(TOKEN_TYPES[0]);
  const [actorToken, setActorToken] = useState('');
  const [actorTokenType, setActorTokenType] = useState(TOKEN_TYPES[0]);
  const [requestedTokenType, setRequestedTokenType] = useState('');
  const [audience, setAudience] = useState('');
  const [resource, setResource] = useState('');
  const [scope, setScope] = useState('');
  const [clientId, setClientId] = useState(CLIENT_ID);
  const [clientSecret, setClientSecret] = useState(CLIENT_SECRET);

  /**
   * §2.1: `actor_token_type` is *"REQUIRED when the `actor_token` parameter is present in the request
   * but MUST NOT be included otherwise"* — one of the few genuinely conditional MUST NOTs in OAuth, and
   * the reason this is derived rather than a free field.
   */
  const delegating = actorToken.trim().length > 0;

  const body: Record<string, string> = {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: subjectToken,
    subject_token_type: subjectTokenType,
    ...(delegating ? { actor_token: actorToken, actor_token_type: actorTokenType } : {}),
    ...(requestedTokenType ? { requested_token_type: requestedTokenType } : {}),
    ...(audience ? { audience } : {}),
    ...(resource ? { resource } : {}),
    ...(scope ? { scope } : {}),
  };

  const exchange = async () => {
    if (!subjectToken.trim()) {
      toast.error('A subject token is required — RFC 8693 §2.1 makes it REQUIRED');
      return;
    }
    const { data, error: err } = await call(() =>
      tokenExchangeService.exchange(body, clientId, clientSecret || undefined),
    );
    if (data) toast.success('Token exchanged');
    else toast.error(err);
  };

  /** What the response is missing or misreports, and which of those is on purpose. */
  const observations = result ? deliberateGaps(result, delegating) : [];

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">Token Exchange</h1>
        <span className="tx-ref">RFC 8693</span>
      </header>

      <p className="tx-standfirst">
        <strong>Impersonation</strong> — send a <code>subject_token</code> alone, and the new token
        acts <em>as</em> that subject. Nothing records that somebody else did the acting.{' '}
        <strong>Delegation</strong> — add an <code>actor_token</code>, and the new token says{' '}
        <em>A acting on behalf of B</em>, which is auditable. RFC 8693 §1.1 draws exactly this
        distinction, and it is the whole reason the actor token exists.
      </p>

      <div className="tx-body">
        {error && <ErrorExplainer error={error} className="mb-3" />}
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
            <span className="tx-turn-note">POST {TOKEN_ENDPOINT}</span>
          </div>

          <label className="tx-field" htmlFor={`${uid}-subject`}>
            <span className="tx-label">subject_token (REQUIRED — §2.1)</span>
            <input
              id={`${uid}-subject`}
              className="tx-input"
              value={subjectToken}
              onChange={(e) => setSubjectToken(e.target.value)}
              placeholder="The token being exchanged. Pre-filled from the vault when one is held."
            />
          </label>
          <label className="tx-field" htmlFor={`${uid}-subject-type`}>
            <span className="tx-label">subject_token_type (REQUIRED — §2.1)</span>
            <select
              id={`${uid}-subject-type`}
              className="tx-select"
              value={subjectTokenType}
              onChange={(e) => setSubjectTokenType(e.target.value)}
            >
              {TOKEN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <p className="tx-hint">
            Leave the actor token empty for <strong>impersonation</strong>. Fill it in for{' '}
            <strong>delegation</strong> — and note that <code>actor_token_type</code> then becomes
            REQUIRED, and <strong>MUST NOT</strong> be sent without it.
          </p>
          <label className="tx-field" htmlFor={`${uid}-actor`}>
            <span className="tx-label">actor_token (OPTIONAL — §2.1)</span>
            <input
              id={`${uid}-actor`}
              className="tx-input"
              value={actorToken}
              onChange={(e) => setActorToken(e.target.value)}
              placeholder="Who is doing the acting"
            />
          </label>
          {delegating && (
            <label className="tx-field" htmlFor={`${uid}-actor-type`}>
              <span className="tx-label">
                actor_token_type (REQUIRED, because actor_token is present)
              </span>
              <select
                id={`${uid}-actor-type`}
                className="tx-select"
                value={actorTokenType}
                onChange={(e) => setActorTokenType(e.target.value)}
              >
                {TOKEN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="tx-row">
            <label className="tx-field" htmlFor={`${uid}-audience`}>
              <span className="tx-label">audience (OPTIONAL)</span>
              <input
                id={`${uid}-audience`}
                className="tx-input"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Logical name of the target service"
              />
            </label>
            <label className="tx-field" htmlFor={`${uid}-resource`}>
              <span className="tx-label">resource (OPTIONAL)</span>
              <input
                id={`${uid}-resource`}
                className="tx-input"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
                placeholder="https://api.example.com"
              />
            </label>
          </div>
          <div className="tx-row">
            <label className="tx-field" htmlFor={`${uid}-scope`}>
              <span className="tx-label">scope (OPTIONAL)</span>
              <input
                id={`${uid}-scope`}
                className="tx-input"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="Narrower than the subject token's"
              />
            </label>
            <label className="tx-field" htmlFor={`${uid}-reqtype`}>
              <span className="tx-label">requested_token_type (OPTIONAL)</span>
              <input
                id={`${uid}-reqtype`}
                className="tx-input"
                value={requestedTokenType}
                onChange={(e) => setRequestedTokenType(e.target.value)}
                placeholder="Defaults to access_token"
              />
            </label>
          </div>

          <div className="tx-row">
            <label className="tx-field" htmlFor={`${uid}-cid`}>
              <span className="tx-label">Client ID</span>
              <input
                id={`${uid}-cid`}
                className="tx-input"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </label>
            <label className="tx-field" htmlFor={`${uid}-secret`}>
              <span className="tx-label">Client Secret</span>
              <input
                id={`${uid}-secret`}
                className="tx-input"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Leave empty for a public client"
              />
            </label>
          </div>

          <RequestBuilder
            method="POST"
            url={TOKEN_ENDPOINT}
            headers={{
              'Content-Type': 'application/x-www-form-urlencoded',
              ...(clientSecret ? { Authorization: `Basic <${clientId}:secret>` } : {}),
            }}
            body={new URLSearchParams(body).toString()}
          />

          <div className="tx-actions">
            <button
              type="button"
              className="tx-btn tx-btn-primary"
              onClick={() => void exchange()}
              disabled={!subjectToken.trim() || loading}
            >
              {loading && <span className="tx-spin" aria-hidden="true" />}
              Exchange token
            </button>
          </div>
        </div>

        {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
        <div
          className="tx-turn"
          data-dir={result ? 'in' : undefined}
          data-state={result ? 'landed' : 'pending'}
        >
          <span className="tx-marker" aria-hidden="true" />
          <div className="tx-turn-head">
            <span className="tx-turn-label">2 · Server → Client</span>
          </div>

          {result ? (
            <div className="space-y-3">
              {observations.length > 0 && (
                /**
                 * The taught gaps, named where they appear.
                 *
                 * `AGENTS.md` records three **deliberate** defects in
                 * `controllers/token-exchange-response.handler.ts`, each locked by a characterization
                 * test and each taught by a Module 06 exercise. A debugger that quietly worked around
                 * them would teach the opposite of the lesson; one that reported them as bugs would be
                 * wrong. So it reports them as intentional, and says which exercise owns each.
                 */
                <div className="tx-evidence" data-outcome="refused">
                  <div className="tx-evidence-head">
                    <span className="tx-evidence-verdict">
                      <GraduationCap
                        className="h-3.5 w-3.5"
                        style={{
                          display: 'inline',
                          verticalAlign: 'text-bottom',
                          marginRight: '0.35em',
                        }}
                      />
                      This response is deliberately non-conformant — Module 06 teaches these
                    </span>
                  </div>
                  {observations.map((o) => (
                    <p key={o.title} className="tx-hint" style={{ display: 'flex', gap: '0.4rem' }}>
                      <ShieldAlert
                        className="h-3 w-3"
                        style={{ marginTop: '0.15em', flexShrink: 0 }}
                      />
                      <span>
                        <strong>{o.title}</strong> — {o.detail}{' '}
                        <span style={{ fontFamily: 'inherit', opacity: 0.75 }}>({o.spec})</span>
                      </span>
                    </p>
                  ))}
                </div>
              )}
              <JsonBlock data={result} label="Token Response" />
            </div>
          ) : (
            <div className="tx-waiting">Exchange a token to see the response here.</div>
          )}
        </div>
      </div>
    </section>
  );
}

interface Observation {
  title: string;
  detail: string;
  spec: string;
}

/**
 * The three deliberate defects, detected in the response rather than assumed.
 *
 * Checked against what actually came back, so if any of them is ever fixed on purpose this panel stops
 * claiming it — the same reason `tests/unit/controllers/token-exchange-response.handler.test.ts` asserts
 * the current behaviour instead of the correct behaviour.
 */
function deliberateGaps(result: TokenResponse, delegating: boolean): Observation[] {
  const out: Observation[] = [];

  if (!result.issued_token_type) {
    out.push({
      title: 'issued_token_type is missing',
      detail:
        'The specification makes it REQUIRED in a successful response, so a conforming client cannot tell what kind of token it received. Module 06 Exercise 6a.',
      spec: 'RFC 8693 §2.2.1',
    });
  }
  if ('client_id' in result || 'subject' in result) {
    out.push({
      title: 'Non-specification members are present',
      detail:
        '`client_id` and `subject` are not response parameters of this grant. Worse, `subject` falls back to the subject token itself when Authlete resolves no subject — which puts a live access token in a field a reader will treat as an identity. Module 06 Exercise 6c.',
      spec: 'RFC 8693 §2.2.1',
    });
  }
  if (delegating) {
    out.push({
      title: 'The actor token was dropped',
      detail:
        'The server does not forward `actorToken`, so this request asked for **delegation** and received **impersonation**: the token carries no record that one party acted for another. Module 06 Exercise 6b.',
      spec: 'RFC 8693 §1.1, §2.1',
    });
  }
  if (result.expires_in === undefined || Number(result.expires_in) > 3600) {
    out.push({
      title: 'No lifetime was requested',
      detail:
        'The exchange passes no `accessTokenDuration`, so the issued token gets the service default — 24 hours here — regardless of how long the subject token had left. Module 06 Exercise 6b.',
      spec: 'RFC 8693 §2.2.1',
    });
  }
  return out;
}

export { TokenExchangeSection };
