import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Wrench,
  FlaskConical,
} from 'lucide-react';
import { decodeError, statusHint } from '@/utils/decode-error';
import { cn } from '@/utils/cn';

/**
 * The raw error, plus what it means and what to do about it.
 *
 * Every section used to render the server's reply verbatim and stop there. For this deployment that
 * meant strings like `[A157357] The client identifier is not found at the expected location` — opaque
 * unless you already knew the answer, and several of them have answers written down in this repo's own
 * audit records.
 *
 * **The raw text is never replaced, only accompanied.** A reader has to be able to see exactly what
 * arrived, both to trust the explanation and to notice when it does not fit.
 */

interface ErrorExplainerProps {
  /** The error as shown to the user — the string a section already holds is enough. */
  error: string;
  /** When the caller knows it. Otherwise it is read out of the text if present. */
  status?: number;
  className?: string;
}

/**
 * How much raw text to show before offering to expand.
 *
 * Not cosmetic: an HTML error page is a realistic response here — a 5xx from the proxy, or this
 * deployment's SPA catch-all, which answers an unknown `/api` path with 9,837 bytes of dashboard HTML
 * (F-27). Measured before fixing: all 9,828 characters of a synthetic one reached the DOM, burying the
 * explanation below a screenful of markup. The full text stays one click away, because the whole
 * premise here is that the reader can always see exactly what arrived.
 */
const RAW_PREVIEW_CHARS = 800;

function ErrorExplainer({ error, status, className }: ErrorExplainerProps) {
  const [open, setOpen] = useState(true);
  const [showFullRaw, setShowFullRaw] = useState(false);
  const decoded = useMemo(() => decodeError({ raw: error, status }), [error, status]);
  const hint = statusHint(decoded.status ?? status);

  /**
   * Open the panel whenever there is *anything* to say — including "this code is not one I know".
   *
   * Gating on `recognised` alone hid the unrecognised-code note completely, which is the opposite of
   * the intent: being told that a code has no entry, and that the text beside it is the vendor's own
   * wording, is useful. Found by a test that expected to see that note and could not.
   */
  const hasExplanation =
    decoded.recognised ||
    Boolean(hint) ||
    Boolean(decoded.authleteCode) ||
    Boolean(decoded.oauthError);

  return (
    <div
      className={cn('rounded-lg border border-red-500/25 bg-red-500/5 overflow-hidden', className)}
    >
      <div className="flex gap-2 items-start px-3 py-2">
        <AlertCircle className="h-4 w-4 text-danger-text mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-danger-text break-words font-mono leading-relaxed">
            {showFullRaw || error.length <= RAW_PREVIEW_CHARS
              ? error
              : `${error.slice(0, RAW_PREVIEW_CHARS)}…`}
          </p>
          {error.length > RAW_PREVIEW_CHARS && (
            <button
              onClick={() => setShowFullRaw((f) => !f)}
              className="mt-1 text-[0.65rem] text-danger-text/70 hover:text-danger-text bg-transparent border-none cursor-pointer p-0 underline"
            >
              {showFullRaw ? 'Show less' : `Show all ${error.length.toLocaleString()} characters`}
            </button>
          )}
          {hasExplanation && (
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="flex items-center gap-1 mt-1.5 text-[0.65rem] text-danger-text/80 hover:text-danger-text bg-transparent border-none cursor-pointer p-0"
            >
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {open ? 'Hide explanation' : 'What does this mean?'}
            </button>
          )}
        </div>
      </div>

      {hasExplanation && open && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-red-500/15">
          {decoded.oauthError && decoded.oauthDoc && (
            <Entry
              badge={decoded.oauthError}
              badgeTone="oauth"
              cause={decoded.oauthDoc.cause}
              fix={decoded.oauthDoc.fix}
              spec={decoded.oauthDoc.spec}
            />
          )}

          {decoded.oauthError && !decoded.oauthDoc && (
            <p className="text-[0.7rem] text-muted-foreground">
              <code className="text-danger-text">{decoded.oauthError}</code> is not a code this tool
              recognises. It may be server-specific — read it alongside the description above.
            </p>
          )}

          {decoded.authleteCode && (decoded.authleteNote || decoded.authleteVendor) && (
            <Entry
              badge={decoded.authleteCode}
              badgeTone="vendor"
              cause={decoded.authleteNote?.cause ?? decoded.authleteVendor?.message ?? ''}
              fix={decoded.authleteNote?.fix}
              spec={
                decoded.authleteNote?.spec ??
                `Authlete's own message${
                  decoded.authleteVendor?.endpoint
                    ? ` for ${decoded.authleteVendor.endpoint}`
                    : decoded.authleteVendor?.endpointCount
                      ? ` (documented on ${decoded.authleteVendor.endpointCount} operations)`
                      : ''
                }`
              }
              verifiedHere={decoded.authleteNote?.verifiedHere}
            />
          )}

          {decoded.authleteCode && !decoded.authleteNote && !decoded.authleteVendor && (
            <p className="text-[0.7rem] text-muted-foreground">
              <code className="text-warning-text">{decoded.authleteCode}</code> is an Authlete
              result code this tool has no entry for — it is neither in the vendored specification
              nor in this repo&apos;s verified findings. The message beside it is the vendor&apos;s
              own words and is the best available description.
            </p>
          )}

          {decoded.errorUri && (
            <p className="text-[0.7rem]">
              <a
                href={decoded.errorUri}
                target="_blank"
                rel="noreferrer"
                className="text-accent-text hover:text-accent-text underline decoration-indigo-500/40"
              >
                The server&apos;s own documentation for this error →
              </a>
            </p>
          )}

          {hint && !decoded.recognised && (
            <p className="text-[0.7rem] text-muted-foreground leading-relaxed">
              <span className="font-mono text-warning-text">HTTP {decoded.status ?? status}</span> —{' '}
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Entry({
  badge,
  badgeTone,
  cause,
  fix,
  spec,
  verifiedHere,
}: {
  badge: string;
  badgeTone: 'oauth' | 'vendor';
  cause: string;
  fix?: string;
  spec: string;
  verifiedHere?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <code
          className={cn(
            'text-[0.65rem] font-mono px-1.5 py-0.5 rounded',
            badgeTone === 'oauth'
              ? 'bg-indigo-500/15 text-accent-text'
              : 'bg-amber-500/15 text-warning-text',
          )}
        >
          {badge}
        </code>
        {verifiedHere && (
          <span
            className="flex items-center gap-1 text-[0.55rem] font-mono uppercase tracking-wider text-success-text/90"
            title="Reproduced against this deployment, not read out of a document"
          >
            <FlaskConical className="h-2.5 w-2.5" />
            verified here
          </span>
        )}
      </div>
      <p className="text-[0.72rem] text-foreground/90 leading-relaxed">{cause}</p>
      {fix && (
        <p className="flex gap-1.5 text-[0.72rem] text-muted-foreground leading-relaxed">
          <Wrench className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/70" />
          <span>{fix}</span>
        </p>
      )}
      <p className="flex gap-1.5 text-[0.65rem] text-muted-foreground/70 font-mono">
        <BookOpen className="h-2.5 w-2.5 mt-0.5 shrink-0" />
        <span>{spec}</span>
      </p>
    </div>
  );
}

export { ErrorExplainer };
