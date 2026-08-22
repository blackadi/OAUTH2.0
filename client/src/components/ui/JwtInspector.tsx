import { useState, useMemo, useCallback } from 'react';
import { ShieldCheck, ShieldX, ShieldQuestion, Clock, AlertTriangle } from 'lucide-react';
import { decodeJwt, verifyJwt, readTimeClaim, formatDelta, type VerifyOutcome, type Jwk } from '@/utils/jwt';
import { CLAIM_DOCS, TIME_CLAIMS } from '@/data/claimDocs';
import { tokenService } from '@/services';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { HelpPopover } from '@/components/ui/HelpPopover';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

/**
 * Header, claims and signature for any JWS this app handles — ID tokens, JWT access tokens, DPoP
 * proofs, request objects, logout tokens, client assertions.
 *
 * The verification result is the reason this exists. A decoded payload is legible, which makes it look
 * authoritative; nothing in the app previously distinguished "this token says `sub: admin`" from "this
 * token is *from* the server and says `sub: admin`". The JWKS was already being fetched and used only
 * to print the key set.
 */

/**
 * Module-level, because the key set changes far more slowly than a component's lifetime and every
 * inspector on the page wants the same answer. Cleared only by a reload — a stale key would show as a
 * `no-key` result naming the `kid`, which is a legible failure rather than a silent wrong one.
 */
let jwksCache: Jwk[] | null = null;

async function loadJwks(): Promise<Jwk[]> {
  if (jwksCache) return jwksCache;
  const response = await tokenService.getJwks();
  jwksCache = response.keys as Jwk[];
  return jwksCache;
}

/** Exposed for tests, which must not inherit a key set from a previous case. */
export function __resetJwksCache(): void {
  jwksCache = null;
}

interface JwtInspectorProps {
  token: string;
  label?: string;
  /** Start with the claim table open. Off by default so a vault entry stays compact. */
  defaultOpen?: boolean;
  className?: string;
}

function JwtInspector({ token, label, defaultOpen = false, className }: JwtInspectorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const decoded = useMemo(() => {
    try {
      return { parts: decodeJwt(token), error: null as string | null };
    } catch (e) {
      return { parts: null, error: e instanceof Error ? e.message : 'Could not decode' };
    }
  }, [token]);

  const verify = useCallback(async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      setOutcome(await verifyJwt(token, await loadJwks()));
    } catch (e) {
      // A JWKS that cannot be fetched is a different failure from a signature that does not verify,
      // and saying so beats reporting the token as invalid.
      setVerifyError(e instanceof Error ? e.message : 'Could not fetch the JWK Set');
    } finally {
      setVerifying(false);
    }
  }, [token]);

  if (decoded.error || !decoded.parts) {
    return (
      <div className={cn('rounded-lg border border-amber-500/30 bg-amber-500/5 p-3', className)}>
        <div className="flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 text-warning-text mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-warning-text">Not a decodable JWT</p>
            <p className="text-[0.7rem] text-warning-text/80 mt-0.5">{decoded.error}</p>
            <p className="text-[0.65rem] text-muted-foreground mt-1.5">
              An opaque access token is normal and not a defect — only some deployments issue JWTs
              here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { header, payload, signature } = decoded.parts;
  const exp = readTimeClaim(payload.exp);
  const alg = typeof header.alg === 'string' ? header.alg : 'unknown';
  const typ = typeof header.typ === 'string' ? header.typ : undefined;

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 flex-wrap">
        {label && <span className="text-xs font-semibold text-foreground">{label}</span>}
        <span className="text-[0.6rem] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-accent-text">
          {alg}
        </span>
        {typ && (
          <span className="text-[0.6rem] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
            typ: {typ}
          </span>
        )}
        {exp && (
          <span
            className={cn(
              'flex items-center gap-1 text-[0.6rem] font-mono px-1.5 py-0.5 rounded',
              exp.delta <= 0
                ? 'bg-red-500/15 text-danger-text'
                : exp.delta < 300
                  ? 'bg-amber-500/15 text-warning-text'
                  : 'bg-emerald-500/15 text-success-text',
            )}
            title={exp.iso}
          >
            <Clock className="h-2.5 w-2.5" />
            {exp.delta <= 0 ? `expired ${formatDelta(exp.delta)}` : `expires ${formatDelta(exp.delta)}`}
          </span>
        )}
        <VerificationBadge outcome={outcome} verifying={verifying} />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {!outcome && (
            <Button size="sm" variant="outline" onClick={verify} loading={verifying}>
              Verify signature
            </Button>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="text-[0.65rem] text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
          >
            {open ? 'Hide claims' : 'Show claims'}
          </button>
        </div>
      </div>

      {verifyError && (
        <p className="px-3 py-2 text-[0.7rem] text-warning-text bg-amber-500/5 border-b border-amber-500/20">
          Could not check the signature: {verifyError}
        </p>
      )}

      {outcome && outcome.status !== 'valid' && (
        <p className="px-3 py-2 text-[0.7rem] text-muted-foreground bg-muted/20 border-b border-border">
          {outcome.reason}
        </p>
      )}

      {open && (
        <div className="p-3 space-y-3">
          <section>
            <SectionLabel>Header</SectionLabel>
            <ClaimTable claims={header} />
          </section>

          <section>
            <SectionLabel>Claims</SectionLabel>
            <ClaimTable claims={payload} />
          </section>

          <section>
            <SectionLabel>Signature</SectionLabel>
            <p className="text-[0.7rem] font-mono text-muted-foreground break-all bg-code/50 rounded p-2 border border-border/40">
              {signature}
            </p>
          </section>

          <button
            onClick={() => setShowRaw((r) => !r)}
            className="text-[0.65rem] text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
          >
            {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
          </button>
          {showRaw && (
            <div className="space-y-2">
              <JsonBlock data={header} label="header" className="[&_pre]:text-[0.7rem] [&_pre]:p-2" />
              <JsonBlock data={payload} label="payload" className="[&_pre]:text-[0.7rem] [&_pre]:p-2" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1.5">
      {children}
    </p>
  );
}

function VerificationBadge({
  outcome,
  verifying,
}: {
  outcome: VerifyOutcome | null;
  verifying: boolean;
}) {
  if (verifying) {
    return (
      <span className="flex items-center gap-1 text-[0.6rem] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
        <ShieldQuestion className="h-2.5 w-2.5" />
        checking
      </span>
    );
  }
  if (!outcome) {
    return (
      <span
        className="flex items-center gap-1 text-[0.6rem] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground"
        title="Decoded only. A payload is legible whether or not the signature is good."
      >
        <ShieldQuestion className="h-2.5 w-2.5" />
        unverified
      </span>
    );
  }
  const tone =
    outcome.status === 'valid'
      ? 'bg-emerald-500/15 text-success-text'
      : outcome.status === 'invalid'
        ? 'bg-red-500/15 text-danger-text'
        : 'bg-amber-500/15 text-warning-text';
  const Icon = outcome.status === 'valid' ? ShieldCheck : outcome.status === 'invalid' ? ShieldX : ShieldQuestion;
  const text =
    outcome.status === 'valid'
      ? `signature valid${outcome.kid ? ` · kid ${outcome.kid}` : ''}`
      : outcome.status === 'invalid'
        ? 'signature INVALID'
        : outcome.status === 'no-key'
          ? 'no matching key'
          : 'cannot verify here';
  return (
    <span className={cn('flex items-center gap-1 text-[0.6rem] font-mono px-1.5 py-0.5 rounded', tone)}>
      <Icon className="h-2.5 w-2.5" />
      {text}
    </span>
  );
}

function ClaimTable({ claims }: { claims: Record<string, unknown> }) {
  const names = Object.keys(claims);
  if (names.length === 0) {
    return <p className="text-[0.7rem] text-muted-foreground italic">empty</p>;
  }
  return (
    <div className="space-y-1">
      {names.map((name) => (
        <ClaimRow key={name} name={name} value={claims[name]} />
      ))}
    </div>
  );
}

function ClaimRow({ name, value }: { name: string; value: unknown }) {
  const doc = CLAIM_DOCS[name];
  const time = TIME_CLAIMS.has(name) ? readTimeClaim(value) : null;

  return (
    <div className="flex items-start gap-2 text-[0.7rem] py-0.5">
      <code className="font-mono text-accent-text shrink-0 min-w-[7rem]">{name}</code>
      <div className="min-w-0 flex-1">
        <span className="font-mono text-foreground break-all">
          {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
        </span>
        {time && (
          <span className="ml-2 text-muted-foreground">
            {time.iso} ({formatDelta(time.delta)})
          </span>
        )}
        {doc && <p className="text-muted-foreground/80 mt-0.5 leading-snug">{doc.note}</p>}
      </div>
      {doc && (
        <div className="shrink-0">
          <HelpPopover title={`${name} — ${doc.name}`} description={doc.note} tips={doc.spec} />
        </div>
      )}
    </div>
  );
}

export { JwtInspector };
