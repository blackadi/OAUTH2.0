import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft, ShieldAlert, GraduationCap } from 'lucide-react';
import { TOKEN_ENDPOINT, CLIENT_ID, CLIENT_SECRET } from '@/config';
import { useToken } from '@/context/TokenContext';
import { tokenExchangeService } from '@/services';
import { useAsyncCall } from '@/hooks/useAsyncCall';
import { useTraces } from '@/hooks/useTraces';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SplitPane } from '@/components/ui/SplitPane';
import { RequestBuilder } from '@/components/ui/RequestBuilder';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { FlowDiagram } from '@/components/ui/FlowDiagram';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { getDoc } from '@/data/operationDocs';
import { sequenceProgress, type SequenceStepSpec } from '@/utils/sequence-progress';
import type { TokenResponse } from '@/types';

/**
 * RFC 8693 Token Exchange — the one flow the debugger could not send.
 *
 * **Why this section exists.** The server implements the grant, `token.controller.ts` has a
 * `TOKEN_EXCHANGE` branch, and Module 06 teaches it through *three deliberate defects*. The only trace
 * of it in the client was a dropdown option in Token Management. So the curriculum had a lab for a flow
 * the debugger could not exercise — and delegation-versus-impersonation is one of the harder ideas in
 * OAuth, which is exactly the kind that benefits from being sent and read rather than described.
 *
 * **It uses the ordinary token endpoint.** No new server route: `grant_type` is the URN and everything
 * else rides in the same form body, which is worth seeing rather than being told.
 *
 * **The three deliberate defects are surfaced, not hidden.** They are *taught*, and this repo's rule is
 * that fixing them silently breaks a lab. A section that quietly worked around them would teach the
 * opposite of what Module 06 teaches, so the response panel names each one where it appears and says it
 * is intentional. Citations verified against RFC 8693 §2.1 and §2.2.1 on 2026-08-22.
 */

/** RFC 8693 §3 token type identifiers. */
const TOKEN_TYPES = [
  'urn:ietf:params:oauth:token-type:access_token',
  'urn:ietf:params:oauth:token-type:refresh_token',
  'urn:ietf:params:oauth:token-type:id_token',
  'urn:ietf:params:oauth:token-type:jwt',
  'urn:ietf:params:oauth:token-type:saml2',
];

const STEPS: SequenceStepSpec[] = [
  {
    id: 'obtain',
    label: 'Hold a token',
    description: 'You need a subject token before you can exchange one.',
  },
  {
    id: 'exchange',
    label: 'Exchange',
    description: '§2.1: POST the subject token to the ordinary token endpoint.',
    endpoint: '/api/token',
  },
  {
    id: 'inspect',
    label: 'Read the answer',
    description: '§2.2.1 requires issued_token_type. See whether it is there.',
  },
];

function TokenExchangeSection() {
  const { tokenSet } = useToken();
  const { loading, result, error, call } = useAsyncCall<TokenResponse>();
  const traces = useTraces();
  const progress = sequenceProgress(STEPS, traces);
  const doc = getDoc('token-ops', 'exchange');

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
    <SectionPanel
      title="Token Exchange (RFC 8693)"
      description="Trade one token for another — impersonation, or delegation with an actor token"
      icon={<ArrowRightLeft className="h-4 w-4" />}
    >
      <FlowDiagram
        steps={STEPS}
        currentStep={progress.currentStep}
        completedSteps={progress.completedSteps}
        className="mb-3"
      />

      {error && <ErrorExplainer error={error} className="mb-3" />}
      {doc && <OperationDescription doc={doc} />}

      {/*
        Impersonation against delegation is the idea this flow exists for, and it is decided by the
        presence of one parameter. Stating it before the form beats discovering it from a 400.
      */}
      <div className="rounded-lg border border-edge-accent bg-tint-accent p-3 mb-3">
        <p className="text-xs text-foreground-muted leading-relaxed m-0">
          <strong className="text-foreground">Impersonation</strong> — send a{' '}
          <code className="text-accent-text">subject_token</code> alone, and the new token acts
          <em> as</em> that subject. Nothing records that somebody else did the acting.{' '}
          <strong className="text-foreground">Delegation</strong> — add an{' '}
          <code className="text-accent-text">actor_token</code>, and the new token says{' '}
          <em>A acting on behalf of B</em>, which is auditable. RFC 8693 §1.1 draws exactly this
          distinction, and it is the whole reason the actor token exists.
        </p>
      </div>

      <SplitPane
        leftLabel="Request"
        rightLabel={result ? 'Response' : ''}
        left={
          <div className="space-y-3">
            <div className="space-y-3">
              <Input
                label="subject_token (REQUIRED — §2.1)"
                value={subjectToken}
                onChange={(e) => setSubjectToken(e.target.value)}
                placeholder="The token being exchanged. Pre-filled from the vault when one is held."
              />
              <Select
                label="subject_token_type (REQUIRED — §2.1)"
                value={subjectTokenType}
                onChange={(e) => setSubjectTokenType(e.target.value)}
                options={TOKEN_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs text-muted-foreground m-0">
                Leave the actor token empty for <strong>impersonation</strong>. Fill it in for{' '}
                <strong>delegation</strong> — and note that{' '}
                <code className="text-accent-text">actor_token_type</code> then becomes REQUIRED,
                and <strong>MUST NOT</strong> be sent without it.
              </p>
              <Input
                label="actor_token (OPTIONAL — §2.1)"
                value={actorToken}
                onChange={(e) => setActorToken(e.target.value)}
                placeholder="Who is doing the acting"
              />
              {delegating && (
                <Select
                  label="actor_token_type (REQUIRED, because actor_token is present)"
                  value={actorTokenType}
                  onChange={(e) => setActorTokenType(e.target.value)}
                  options={TOKEN_TYPES.map((t) => ({ value: t, label: t }))}
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="audience (OPTIONAL)"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Logical name of the target service"
              />
              <Input
                label="resource (OPTIONAL)"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
                placeholder="https://api.example.com"
              />
              <Input
                label="scope (OPTIONAL)"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="Narrower than the subject token's"
              />
              <Input
                label="requested_token_type (OPTIONAL)"
                value={requestedTokenType}
                onChange={(e) => setRequestedTokenType(e.target.value)}
                placeholder="Defaults to access_token"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
              <Input
                label="Client Secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Leave empty for a public client"
              />
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

            <Button
              onClick={() => void exchange()}
              loading={loading}
              disabled={!subjectToken.trim()}
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Exchange token
            </Button>
          </div>
        }
        right={
          result ? (
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
                <div className="rounded-lg border border-edge-warning bg-tint-warning p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-text m-0">
                    <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                    This response is deliberately non-conformant — Module 06 teaches these
                  </p>
                  {observations.map((o) => (
                    <p
                      key={o.title}
                      className="flex gap-1.5 text-xs text-foreground-muted leading-relaxed m-0"
                    >
                      <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0 text-warning-text" />
                      <span>
                        <strong className="text-foreground">{o.title}</strong> — {o.detail}{' '}
                        <span className="text-muted-foreground/70 font-mono">({o.spec})</span>
                      </span>
                    </p>
                  ))}
                </div>
              )}
              <JsonBlock data={result} label="Token Response" />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[120px] rounded-lg border border-dashed border-border bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Exchange a token to see the response here
              </p>
            </div>
          )
        }
      />
    </SectionPanel>
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
