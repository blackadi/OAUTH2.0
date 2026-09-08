import { useState, useId } from 'react';
import { toast } from 'sonner';
import { useToken } from '@/context/TokenContext';
import { tokenService } from '@/services';
import { AUTHORIZATION_ENDPOINT, CLIENT_ID, DEFAULT_SCOPES, getRedirectUri } from '@/config';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { AdminAuth } from '@/components/layout/AdminAuth';
import { ArrowUpCircle } from 'lucide-react';
import { getDoc } from '@/data/operationDocs';
import { stringMember } from '@/utils/parse-json';
import { useCredentials } from '@/context/CredentialContext';
import { HttpError } from '@/services/transport';
import '@/styles/transcript.css';

interface StepUpChallenge {
  error: string;
  error_description?: string;
  acr_values?: string;
  max_age?: string;
  acr?: string;
  auth_time?: number;
}

/**
 * RFC 9470, rendered as the exchange it is — the same conversion `ParSection` had, and for the same
 * reason. A form-then-dump shape says nothing about *why* the introspection above resolves into a
 * front-channel redirect below: the challenge fields on turn 2 are exactly the parameters turn 3 uses,
 * and a spine makes that visible instead of implied by page order.
 *
 * **Behaviour is unchanged.** `handleIntrospect`, the `HttpError.body` challenge read, and `reAuthUrl`'s
 * construction are the incumbent implementation verbatim; only the markup around them changed.
 */
function StepUpSection() {
  const doc = getDoc('step-up', 'introspect');
  const { tokenSet } = useToken();
  const at = tokenSet?.access_token;
  const { loading, result, error, call } = useAsyncCall();

  const [requiredAcrs, setRequiredAcrs] = useState('urn:mace:incommon:iap:silver');
  const [maxAge, setMaxAge] = useState('');
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null);

  // The introspection endpoint is protected (RFC 7662 §2.1) — this flow drives it, so it needs the
  // deployment's admin credentials.
  // The management credential is shared for the page rather than owned here: eight sections
  // held their own copy, and a route change unmounts a section, so it had to be retyped on
  // every navigation.
  const { clientId: adminId, clientSecret: adminSecret } = useCredentials();

  const uid = useId();

  const handleIntrospect = async () => {
    setChallenge(null);
    let detectedChallenge: StepUpChallenge | null = null;
    const { data, error: err } = await call(async () => {
      const opts: { acrValues?: string; maxAge?: number } = {};
      if (requiredAcrs.trim()) opts.acrValues = requiredAcrs.trim();
      if (maxAge.trim()) opts.maxAge = Number(maxAge.trim());
      try {
        return await tokenService.introspection(
          at!,
          adminId,
          adminSecret,
          Object.keys(opts).length ? opts : undefined,
        );
      } catch (e) {
        /**
         * The RFC 9470 challenge, read off the actual response body — not the composite display string.
         *
         * This used to be `parseJsonObject(err)` where `err` was `useAsyncCall`'s already-stringified
         * `describeError()` output (`"{status}{statusText} · {WWW-Authenticate} · {body}"`), which is
         * never valid JSON on its own — so the challenge was never detected, regardless of what the server
         * returned. `HttpError.body` is the actual parsed JSON body; read the challenge from there, inside
         * this try/catch, then re-throw so `call()`'s normal error-string/toast handling still runs.
         */
        if (e instanceof HttpError) {
          const body = e.body;
          if (
            body &&
            typeof body === 'object' &&
            !Array.isArray(body) &&
            stringMember(body, 'error') === 'insufficient_user_authentication'
          ) {
            detectedChallenge = {
              error: 'insufficient_user_authentication',
              error_description: stringMember(body, 'error_description'),
              acr_values: stringMember(body, 'acr_values'),
              max_age: stringMember(body, 'max_age'),
              acr: stringMember(body, 'acr'),
            };
          }
        }
        throw e;
      }
    });

    if (data) {
      toast.success('Token is sufficient — no step-up required');
      setChallenge(null);
    } else if (detectedChallenge) {
      setChallenge(detectedChallenge);
      toast.error('Step-up authentication required');
    } else if (err) {
      toast.error(err);
    }
  };

  const reAuthUrl = (() => {
    if (!challenge) return '';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: getRedirectUri(),
      scope: DEFAULT_SCOPES,
      state: crypto.randomUUID(),
      nonce: crypto.randomUUID(),
    });
    if (challenge.acr_values) {
      // Build claims request with essential ACR
      const acrList = challenge.acr_values.split(' ');
      params.append(
        'claims',
        JSON.stringify({
          id_token: {
            acr: { essential: true, values: acrList },
          },
        }),
      );
    }
    if (challenge.max_age) {
      params.append('max_age', challenge.max_age);
    }
    params.append('prompt', 'login');
    return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
  })();

  const settled = Boolean(result || challenge || error);

  return (
    <section className="tx">
      <header className="tx-masthead">
        <h1 className="tx-title">Step-Up Authentication</h1>
        <span className="tx-ref">RFC 9470</span>
      </header>

      <p className="tx-standfirst">
        A protected resource decides a token&apos;s authentication is not strong enough and names
        what it needs — an ACR, a maximum authentication age. The client reads that requirement off
        the refusal and re-authorizes asking for it as a hard requirement, not a preference.
      </p>

      <div className="tx-body">
        {doc && (
          <OperationDescription
            doc={doc}
            className="tx-doc bg-transparent border-l-0 rounded-none p-0 mb-0"
          />
        )}

        {!at && (
          <div className="tx-waiting">
            <strong>No access token available.</strong> Obtain a token first via Grant Flows, then
            return here to test step-up challenges.
          </div>
        )}

        {at && (
          <>
            {/* ── Turn 1 ─────────────────────────────────────────────────────── */}
            <div className="tx-turn" data-dir="out">
              <span className="tx-marker" aria-hidden="true" />
              <div className="tx-turn-head">
                <span className="tx-turn-label">1 · Client → Server</span>
                <span className="tx-turn-note">introspecting with requirements</span>
              </div>

              <p className="tx-hint" style={{ marginBottom: '0.5rem' }}>
                RFC 7662 §2.1 requires the introspection endpoint to be protected, so this flow
                needs the deployment&apos;s admin credentials. Without them the server answers{' '}
                <code>401</code>.
              </p>
              {/* Shared across ~8 admin-gated sections; not restyled into `.tx` here, since that is a
                  separate, cross-cutting change rather than something this conversion owns. */}
              <AdminAuth />

              <label className="tx-field" htmlFor={`${uid}-acr`}>
                <span className="tx-label">Required ACR Values (space-separated)</span>
                <input
                  id={`${uid}-acr`}
                  className="tx-input"
                  value={requiredAcrs}
                  onChange={(e) => setRequiredAcrs(e.target.value)}
                  placeholder="e.g. urn:mace:incommon:iap:silver"
                />
              </label>
              <label className="tx-field" htmlFor={`${uid}-maxage`}>
                <span className="tx-label">Max Authentication Age (seconds)</span>
                <input
                  id={`${uid}-maxage`}
                  className="tx-input"
                  type="number"
                  value={maxAge}
                  onChange={(e) => setMaxAge(e.target.value)}
                  placeholder="e.g. 300"
                />
              </label>

              <div className="tx-actions">
                <button
                  type="button"
                  className="tx-btn tx-btn-primary"
                  onClick={handleIntrospect}
                  disabled={!at || loading}
                >
                  {loading && <span className="tx-spin" aria-hidden="true" />}
                  {loading ? 'Introspecting…' : 'Introspect with Requirements'}
                </button>
              </div>
            </div>

            {/* ── Turn 2 ─────────────────────────────────────────────────────── */}
            <div
              className="tx-turn"
              data-dir={settled ? 'in' : undefined}
              data-state={settled ? 'landed' : 'pending'}
            >
              <span className="tx-marker" aria-hidden="true" />
              <div className="tx-turn-head">
                <span className="tx-turn-label">2 · Server → Client</span>
                {challenge && (
                  <span className="tx-turn-note">401 insufficient_user_authentication</span>
                )}
                {Boolean(result) && !challenge && <span className="tx-turn-note">200</span>}
              </div>

              {challenge ? (
                <div className="tx-evidence tx-lands" data-outcome="refused">
                  <div className="tx-evidence-head">
                    <span className="tx-evidence-verdict">Step-up authentication required</span>
                  </div>
                  <span className="tx-datum">
                    <span className="tx-datum-key">error</span>
                    <span className="tx-datum-value">{challenge.error}</span>
                  </span>
                  {challenge.acr && (
                    <span className="tx-datum">
                      <span className="tx-datum-key">Current ACR</span>
                      <span className="tx-datum-value">{challenge.acr}</span>
                    </span>
                  )}
                  {challenge.auth_time && (
                    <span className="tx-datum">
                      <span className="tx-datum-key">Auth Time</span>
                      <span className="tx-datum-value">
                        {new Date(challenge.auth_time * 1000).toLocaleString()}
                      </span>
                    </span>
                  )}
                  {challenge.acr_values && (
                    <span className="tx-datum">
                      <span className="tx-datum-key">Required ACRs</span>
                      <span className="tx-datum-value">{challenge.acr_values}</span>
                    </span>
                  )}
                  {challenge.max_age && (
                    <span className="tx-datum">
                      <span className="tx-datum-key">Max Age</span>
                      <span className="tx-datum-value">{challenge.max_age}s</span>
                    </span>
                  )}
                  {challenge.error_description && (
                    <p className="tx-hint">{challenge.error_description}</p>
                  )}
                </div>
              ) : result ? (
                <div className="tx-evidence tx-lands" data-outcome="issued">
                  <div className="tx-evidence-head">
                    <span className="tx-evidence-verdict">Token is sufficient</span>
                  </div>
                  <JsonBlock data={result} label="Introspection Result" />
                </div>
              ) : error ? (
                <ErrorExplainer error={error} />
              ) : (
                <div className="tx-waiting">
                  The server answers either a plain introspection result, or a <code>401</code>{' '}
                  naming the <code>acr_values</code>/<code>max_age</code> it needs. Nothing is sent
                  until you introspect.
                </div>
              )}
            </div>

            {/* ── Turn 3 ─────────────────────────────────────────────────────── */}
            <div className="tx-turn" data-state={challenge ? 'landed' : 'pending'}>
              <span className="tx-marker" aria-hidden="true" />
              <div className="tx-turn-head">
                <span className="tx-turn-label">3 · Browser → Server</span>
                <span className="tx-turn-note">front channel</span>
              </div>

              {challenge && reAuthUrl ? (
                <div className="space-y-2">
                  <p className="tx-hint">
                    Re-authorize with stronger authentication requirements — the ACR travels as an{' '}
                    <code>essential</code> claim, not a preference, plus <code>prompt=login</code>{' '}
                    to force a fresh authentication event:
                  </p>
                  <a href={reAuthUrl}>
                    <button type="button" className="tx-btn tx-btn-primary">
                      <ArrowUpCircle className="h-4 w-4" style={{ marginRight: '0.4em' }} />
                      Re-Authenticate with Required ACR
                    </button>
                  </a>
                </div>
              ) : (
                <div className="tx-waiting">
                  A step-up challenge builds this request. Nothing to send until one lands above.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export { StepUpSection };
