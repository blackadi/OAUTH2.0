import { Link } from 'react-router-dom';
import { ArrowRight, KeyRound, ShieldCheck, Clock } from 'lucide-react';
import { JsonBlock } from './JsonBlock';
import { JwtInspector } from './JwtInspector';
import { formatDelta } from '@/utils/jwt';
import { cn } from '@/utils/cn';
import type { IssuedTokens } from '@/types';

/**
 * What you now hold, and what you can do with it.
 *
 * **The gap this closes.** A completed flow rendered `<JsonBlock data={result} label="Token Response" />`
 * and stopped. Not a `JwtInspector` — so the ID token the headline flow had just obtained was **not
 * inspectable from the section that obtained it**; you had to find the Token Vault in the sidebar or
 * still be on the callback page. Not a statement of scope, lifetime or presentation scheme. And no next
 * step: grepping the whole codebase for cross-section guidance — *"next step"*, *"now that you"*, *"try
 * the"*, *"go to the"* — turned up **one** hit, and it was Authlete's wording inside a CIBA description.
 *
 * So the reward for completing OAuth's central flow was a JSON blob and five green ticks. Every piece
 * needed to do better already existed; this is composition, not construction.
 *
 * **Three things it states rather than leaves to be inferred**, because each is the difference between a
 * 200 and a specific failure elsewhere in the app:
 *
 * - the **scheme** the token must be presented with — RFC 9449 §7.1 gives a sender-constrained token no
 *   alternative, and Authlete refuses the bearer downgrade with `[A089311]` at UserInfo;
 * - the **lifetime**, as a countdown rather than an integer, because `expires_in` is relative to an
 *   instant the reader has already lost;
 * - the **scope**, which is what a resource server will actually check.
 */

interface TokenOutcomeProps {
  tokens: IssuedTokens;
  className?: string;
}

/** What the token can be spent on next, by name, so the sidebar is not a guessing game. */
const NEXT_STEPS: { to: string; label: string; why: string }[] = [
  {
    to: '/token-ops',
    label: 'Token Operations',
    why: 'Call UserInfo with it, introspect it (RFC 7662), or revoke it (RFC 7009).',
  },
  {
    to: '/step-up',
    label: 'Step-Up Auth',
    why: 'See a resource server demand stronger authentication (RFC 9470).',
  },
  {
    to: '/grant-mgmt',
    label: 'Grant Management',
    why: 'Query or revoke the grant this token was issued under.',
  },
];

function TokenOutcome({ tokens, className }: TokenOutcomeProps) {
  // `token_type` is compared case-insensitively per RFC 9110 §11.1 — Authlete answers `DPoP`, other
  // servers answer `dpop`, and the scheme decides whether the next call succeeds.
  const isDpop = (tokens.token_type ?? '').toLowerCase() === 'dpop';
  const scheme = isDpop ? 'DPoP' : 'Bearer';
  const scopes = (tokens.scope ?? '').split(/\s+/).filter(Boolean);
  const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : undefined;

  return (
    <div className={cn('space-y-3', className)}>
      {/*
        The "so what" card gets the reveal, not the whole pane.

        `JsonBlock` below animates its own `<pre>`, but the summary is the part a person reads first and
        the part that changes meaning between runs — a second token with a different scope looks identical
        at a glance. Keyed on the access token so a *new* one animates and a re-render does not.
      */}
      <div
        key={tokens.access_token ?? 'no-token'}
        className="animate-reveal rounded-lg border border-edge-success bg-tint-success p-3 space-y-2.5"
      >
        <p className="text-xs font-semibold text-success-text m-0">You now hold:</p>

        <ul className="space-y-1.5 m-0 p-0 list-none">
          {tokens.access_token && (
            <li className="flex gap-2 items-start text-xs text-foreground-muted">
              <KeyRound className="h-3.5 w-3.5 mt-0.5 shrink-0 text-success-text" />
              <span>
                An <strong className="text-foreground">access token</strong>, to be presented as{' '}
                <code className="text-accent-text">Authorization: {scheme} &lt;token&gt;</code>
                {isDpop && (
                  <>
                    {' '}
                    with a fresh proof on every request. Presenting it as{' '}
                    <code className="text-accent-text">Bearer</code> is refused — RFC 9449 §7.2, and
                    Authlete answers <code className="text-accent-text">[A089311]</code>.
                  </>
                )}
                {!isDpop && ' — it is a bearer token, so whoever holds it can use it.'}
              </span>
            </li>
          )}
          {tokens.id_token && (
            <li className="flex gap-2 items-start text-xs text-foreground-muted">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-success-text" />
              <span>
                An <strong className="text-foreground">ID token</strong> — a statement about the
                user, for this client. It is not an API credential and must never be sent to a
                resource server. Verify its signature below before believing a claim in it.
              </span>
            </li>
          )}
          {tokens.refresh_token && (
            <li className="flex gap-2 items-start text-xs text-foreground-muted">
              <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-success-text" />
              <span>
                A <strong className="text-foreground">refresh token</strong>, to obtain a new access
                token without sending the user back. It is opaque by design — there is nothing in it
                to decode.
              </span>
            </li>
          )}
        </ul>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs font-mono text-muted-foreground pt-1 border-t border-edge-success">
          <span>
            token_type: <span className="text-success-text">{tokens.token_type ?? '—'}</span>
          </span>
          {expiresIn !== undefined && (
            <span title={`${expiresIn} seconds from issuance`}>
              expires: <span className="text-success-text">{formatDelta(expiresIn)}</span>
            </span>
          )}
          <span>
            scope:{' '}
            {scopes.length ? (
              <span className="text-success-text">{scopes.join(' ')}</span>
            ) : (
              <span className="text-warning-text">none granted</span>
            )}
          </span>
        </div>
      </div>

      {/* The inspector belongs beside the token it decodes. It used to be reachable only from the
          sidebar vault or the callback page, so the section that obtained the ID token could not show
          it. Unverified by default, deliberately — see `utils/jwt.ts`. */}
      {tokens.id_token && <JwtInspector token={tokens.id_token} label="ID Token" defaultOpen />}
      {tokens.access_token && <JwtInspector token={tokens.access_token} label="Access Token" />}

      <JsonBlock data={tokens} label="Token Response" />

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-xs font-semibold text-foreground m-0 mb-1.5">What to do with it</p>
        <ul className="space-y-1.5 m-0 p-0 list-none">
          {NEXT_STEPS.map((step) => (
            <li key={step.to} className="text-xs">
              <Link
                to={step.to}
                className="inline-flex items-center gap-1 text-accent-text hover:underline"
              >
                {step.label}
                <ArrowRight className="h-3 w-3" />
              </Link>
              <span className="text-muted-foreground"> — {step.why}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export { TokenOutcome };
