import { useMemo, useState } from 'react';
import { BookOpen, Search, ShieldAlert } from 'lucide-react';
import { AUTH_PARAMS, PARAM_GROUPS } from '@/data/authParams';
import { TOKEN_PARAMS } from '@/data/tokenParams';
import { CLAIM_DOCS } from '@/data/claimDocs';
import { OAUTH_ERRORS, AUTHLETE_NOTES } from '@/data/errorDocs';
import { GLOSSARY, glossarySlug } from '@/data/glossary';
import { Input } from '@/components/ui/Input';
import { cn } from '@/utils/cn';

/**
 * The one **reading surface** in an application that had none.
 *
 * **Why this page exists.** The audit classified all 20 routes as *doing* surfaces — parameter editors
 * with response panes — and found **zero** reading surfaces. That was not a CSS finding. The corpus a
 * reading surface would need was already written and shipped: 24 authorization parameters with verified
 * citations, 8 token-request parameters, 26 JWT claims, 20 specification error codes, 26 vendor codes
 * reproduced live against this deployment. All of it was reachable **only by clicking a 20px icon inside
 * a form**. A learner sent a link on a phone had nowhere to arrive except a form.
 *
 * So this is composition, not authorship. Every entry below is read from the same module the interactive
 * surfaces read, which is the point: there is exactly one copy of each explanation, and a correction in
 * one place fixes both.
 *
 * **Built as a reading surface, held to that standard.** Single column throughout, prose measured with
 * `max-w-prose`, no multi-pane layout, every section deep-linkable by fragment, and nothing that needs a
 * pointer. It must hold at 360px — see the responsive posture in the audit.
 */

type Tab = 'glossary' | 'authorize' | 'token' | 'claims' | 'errors';

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'glossary', label: 'Glossary', blurb: 'The words, including the ones no RFC defines.' },
  {
    id: 'authorize',
    label: 'Authorization request',
    blurb: 'Every parameter the authorization endpoint understands.',
  },
  {
    id: 'token',
    label: 'Token request',
    blurb: 'The exchange where PKCE is proven rather than asserted.',
  },
  { id: 'claims', label: 'JWT claims', blurb: 'What each claim means, and who requires it.' },
  { id: 'errors', label: 'Errors', blurb: 'Specification codes, and vendor codes verified here.' },
];

function ReferencePage() {
  const [tab, setTab] = useState<Tab>('glossary');
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const matches = useMemo(
    () => (text: string) => !needle || text.toLowerCase().includes(needle),
    [needle],
  );

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-tint-accent text-accent-text shrink-0">
            <BookOpen className="h-4 w-4" />
          </span>
          <h1 className="text-base font-semibold text-foreground tracking-tight m-0">Reference</h1>
        </div>
        <p className="text-xs text-muted-foreground max-w-prose m-0">
          Everything the interactive panels explain, in one place you can read without sending a
          request. Same source as the tooltips — a correction here is a correction there. Every
          citation was checked against the primary source.
        </p>
      </header>

      <Input
        label="Filter"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="state, PKCE, invalid_grant, aud…"
      />

      {/* Wraps rather than scrolls: this is a reading surface, and five labels have to fit at 360px. */}
      <nav className="flex flex-wrap gap-1.5" aria-label="Reference sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'true' : undefined}
            className={cn(
              'text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors',
              tab === t.id
                ? 'bg-tint-accent-strong text-accent-text border-edge-accent font-medium'
                : 'bg-transparent text-muted-foreground border-border hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <p className="text-xs text-muted-foreground/80 max-w-prose m-0">
        {TABS.find((t) => t.id === tab)?.blurb}
      </p>

      {tab === 'glossary' && (
        <Section>
          {GLOSSARY.filter(
            (e) => matches(e.term) || matches(e.definition) || matches(e.here ?? ''),
          ).map((entry) => (
            <Entry
              key={entry.term}
              id={`glossary-${glossarySlug(entry.term)}`}
              title={entry.term}
              spec={entry.spec}
              body={entry.definition}
              here={entry.here}
              footer={
                entry.see?.length ? (
                  <span className="text-2xs text-muted-foreground">
                    See also: {entry.see.join(' · ')}
                  </span>
                ) : undefined
              }
            />
          ))}
        </Section>
      )}

      {tab === 'authorize' && (
        <div className="space-y-5">
          {PARAM_GROUPS.map((group) => {
            const params = AUTH_PARAMS.filter(
              (p) =>
                p.group === group.id &&
                (matches(p.name) || matches(p.note) || matches(p.threat ?? '')),
            );
            if (params.length === 0) return null;
            return (
              <div key={group.id} className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground m-0">{group.label}</h2>
                <p className="text-xs text-muted-foreground max-w-prose m-0">{group.blurb}</p>
                <Section>
                  {params.map((p) => (
                    <Entry
                      key={p.name}
                      id={`param-${p.name}`}
                      title={p.name}
                      badge={p.requirement}
                      spec={p.spec}
                      body={p.note}
                      threat={p.threat}
                    />
                  ))}
                </Section>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'token' && (
        <Section>
          {TOKEN_PARAMS.filter((p) => matches(p.name) || matches(p.note) || matches(p.failure)).map(
            (p) => (
              <Entry
                key={p.name}
                id={`token-${p.name}`}
                title={p.name}
                badge={p.requirement}
                spec={p.spec}
                body={p.note}
                threat={p.failure}
                threatLabel="What breaks"
              />
            ),
          )}
        </Section>
      )}

      {tab === 'claims' && (
        <Section>
          {Object.entries(CLAIM_DOCS)
            .filter(([name, doc]) => matches(name) || matches(doc.note) || matches(doc.name))
            .map(([name, doc]) => (
              <Entry
                key={name}
                id={`claim-${name}`}
                title={name}
                badge={doc.name}
                spec={doc.spec}
                body={doc.note}
              />
            ))}
        </Section>
      )}

      {tab === 'errors' && (
        <div className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground m-0">Specification error codes</h2>
            <Section>
              {Object.entries(OAUTH_ERRORS)
                .filter(([code, doc]) => matches(code) || matches(doc.cause))
                .map(([code, doc]) => (
                  <Entry
                    key={code}
                    id={`error-${code}`}
                    title={code}
                    spec={doc.spec}
                    body={doc.cause}
                    here={doc.fix}
                    hereLabel="Fix"
                  />
                ))}
            </Section>
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground m-0">
              Authlete result codes, reproduced against this deployment
            </h2>
            <p className="text-xs text-muted-foreground max-w-prose m-0">
              Not read out of a document. Each of these was produced by a live request here, which
              is why they are the ones a developer actually hits — the overlap with the vendor’s own
              documented examples is zero.
            </p>
            <Section>
              {Object.entries(AUTHLETE_NOTES)
                .filter(([code, doc]) => matches(code) || matches(doc.cause))
                .map(([code, doc]) => (
                  <Entry
                    key={code}
                    id={`authlete-${code}`}
                    title={code}
                    spec={doc.spec}
                    body={doc.cause}
                    here={doc.fix}
                    hereLabel="Fix"
                  />
                ))}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(items) && items.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Nothing matches that filter.</p>;
  }
  return (
    <div className="rounded-xl border border-border divide-y divide-border/60 bg-card">{items}</div>
  );
}

interface EntryProps {
  id: string;
  title: string;
  badge?: string;
  spec: string;
  body: string;
  here?: string;
  hereLabel?: string;
  threat?: string;
  threatLabel?: string;
  footer?: React.ReactNode;
}

function Entry({
  id,
  title,
  badge,
  spec,
  body,
  here,
  hereLabel = 'On this deployment',
  threat,
  threatLabel = 'Why it exists',
  footer,
}: EntryProps) {
  return (
    // `scroll-mt` keeps the sticky header from covering the entry a fragment link lands on.
    <article id={id} className="p-3.5 space-y-1.5 scroll-mt-16">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-xs font-mono font-semibold text-accent-text m-0">
          {/* A self-link, so any single entry can be shared rather than the whole page. */}
          <a href={`#${id}`} className="no-underline text-inherit hover:underline">
            {title}
          </a>
        </h3>
        {badge && (
          <span className="text-2xs font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
            {badge}
          </span>
        )}
      </div>

      <p className="text-xs text-foreground-muted leading-relaxed max-w-prose m-0">{body}</p>

      {here && (
        <p className="text-xs text-muted-foreground leading-relaxed max-w-prose m-0">
          <span className="text-2xs uppercase tracking-wider text-muted-foreground/70">
            {hereLabel}:
          </span>{' '}
          {here}
        </p>
      )}

      {threat && (
        <p className="flex gap-1.5 text-xs text-foreground-muted leading-relaxed max-w-prose m-0 border-l-2 border-edge-warning pl-2">
          <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0 text-warning-text" />
          <span>
            <span className="text-2xs uppercase tracking-wider text-warning-text/80">
              {threatLabel}:
            </span>{' '}
            {threat}
          </span>
        </p>
      )}

      <p className="flex gap-1.5 text-2xs text-muted-foreground/70 font-mono m-0">
        <Search className="h-2.5 w-2.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{spec}</span>
      </p>

      {footer}
    </article>
  );
}

export default ReferencePage;
