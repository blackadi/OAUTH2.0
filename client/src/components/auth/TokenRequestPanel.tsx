import { useState } from 'react';
import { AlertTriangle, BookOpen, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { TOKEN_PARAMS, tokenParamsFor, type TokenParamSpec } from '@/data/tokenParams';
import { RequestBuilder } from '@/components/ui/RequestBuilder';
import { cn } from '@/utils/cn';

/**
 * The token request, parameter by parameter — the step the tool did not teach.
 *
 * `AuthorizeRequestBuilder` gives the authorization request 24 documented parameters, a live URL and a
 * raw editor. Its counterpart for `POST /api/token` was **nothing**: no preview, no parameter table, no
 * explanation, and the exchange itself firing inside a `useEffect` on page load. So the one step where
 * PKCE is *proven* rather than asserted, where client authentication happens, and where four of the six
 * commonest OAuth errors occur, was the one step with no teaching surface at all.
 *
 * **Shows what was sent, not a reconstruction.** The values come from the same object the exchange used,
 * for the same reason `AuthorizeRequestBuilder` navigates to the string it displays: a preview that
 * disagrees with the wire is worse than no preview, because it is the thing people read *instead of* the
 * request. `RequestBuilder` renders the headers and body, and its cURL export is redaction-aware.
 *
 * Deliberately **not** an editable re-sender. The authorization code is single-use, so a second attempt
 * with an edited parameter would fail with `invalid_grant` for the wrong reason — it would look like the
 * edit was rejected when in fact the code was already spent. The place to experiment is step 1's
 * builder, where a deliberately broken `code_challenge` produces the *real* PKCE failure.
 */

interface TokenRequestPanelProps {
  /** The form body exactly as sent. */
  body: Record<string, string>;
  endpoint: string;
  /** Present when the client authenticated with a Basic header rather than in the body. */
  basicAuthClientId?: string;
  className?: string;
}

function authKindOf(body: Record<string, string>): 'none' | 'secret' | 'assertion' {
  if (body.client_assertion) return 'assertion';
  if (body.client_secret) return 'secret';
  return 'none';
}

/** Credential values are never printed here — the parameter is named, its value is not. */
const SECRET_PARAMS = new Set(['client_secret', 'client_assertion', 'code_verifier', 'code']);

function displayValue(name: string, value: string | undefined): string {
  if (value === undefined) return '(not sent)';
  if (!SECRET_PARAMS.has(name)) return value;
  if (value.length <= 12) return '●●●●●●';
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} chars)`;
}

function TokenRequestPanel({
  body,
  endpoint,
  basicAuthClientId,
  className,
}: TokenRequestPanelProps) {
  const [open, setOpen] = useState(false);
  const auth = basicAuthClientId ? 'secret' : authKindOf(body);
  const sent = tokenParamsFor({ pkce: Boolean(body.code_verifier), auth });

  /**
   * A parameter the specification expects that this request did not carry.
   *
   * Worth surfacing rather than silently omitting: the interesting question about a failing exchange is
   * usually *what is missing*, and `invalid_grant` never says.
   */
  const missing = TOKEN_PARAMS.filter((p) => p.presence === 'always' && body[p.name] === undefined);

  return (
    <div className={cn('space-y-2', className)}>
      <RequestBuilder
        method="POST"
        url={endpoint}
        headers={{
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(basicAuthClientId ? { Authorization: `Basic <${basicAuthClientId}:secret>` } : {}),
        }}
        body={new URLSearchParams(body).toString()}
      />

      {missing.length > 0 && (
        <div className="flex gap-2 items-start rounded-lg border border-edge-warning bg-tint-warning p-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-warning-text mt-0.5 shrink-0" />
          <p className="text-xs text-warning-text leading-relaxed">
            This request carried no{' '}
            {missing.map((p, i) => (
              <span key={p.name}>
                {i > 0 && ', '}
                <code>{p.name}</code>
              </span>
            ))}
            , which RFC 6749 §4.1.3 requires.
          </p>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-accent-text hover:underline bg-transparent border-none cursor-pointer p-0"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {open
          ? 'Hide what each parameter does'
          : `What each of these ${sent.length} parameters does, and what breaks without it`}
      </button>

      {open && (
        <div className="rounded-lg border border-border divide-y divide-border/50">
          {sent.map((spec) => (
            <ParamRow key={spec.name} spec={spec} value={body[spec.name]} />
          ))}
        </div>
      )}
    </div>
  );
}

function ParamRow({ spec, value }: { spec: TokenParamSpec; value: string | undefined }) {
  const isRequired = spec.requirement.startsWith('REQUIRED');

  return (
    <div className="p-3 space-y-1.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <code className="text-xs font-mono text-accent-text">{spec.name}</code>
        <span
          className={cn(
            'text-2xs font-mono uppercase tracking-wider px-1.5 py-0.5 rounded',
            isRequired
              ? 'bg-tint-accent-strong text-accent-text'
              : 'bg-muted/60 text-muted-foreground',
          )}
        >
          {spec.requirement}
        </span>
        <span className="text-2xs font-mono text-muted-foreground break-all">
          = {displayValue(spec.name, value)}
        </span>
      </div>

      <p className="text-xs text-foreground-muted leading-relaxed m-0">{spec.note}</p>

      <p className="flex gap-1.5 text-xs text-muted-foreground leading-relaxed m-0">
        <Wrench className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/70" />
        <span>{spec.failure}</span>
      </p>

      <p className="flex gap-1.5 text-2xs text-muted-foreground/70 font-mono m-0">
        <BookOpen className="h-2.5 w-2.5 mt-0.5 shrink-0" />
        <span>{spec.spec}</span>
      </p>
    </div>
  );
}

export { TokenRequestPanel };
