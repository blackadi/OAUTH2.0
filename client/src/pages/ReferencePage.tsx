import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, ShieldAlert } from 'lucide-react';
import { AUTH_PARAMS, PARAM_GROUPS } from '@/data/authParams';
import { TOKEN_PARAMS } from '@/data/tokenParams';
import { CLAIM_DOCS } from '@/data/claimDocs';
import { OAUTH_ERRORS, AUTHLETE_NOTES } from '@/data/errorDocs';
import { GLOSSARY, glossarySlug } from '@/data/glossary';
import { Input } from '@/components/ui/Input';
import { Prose } from '@/components/ui/Prose';
import { useUrlState } from '@/hooks/useUrlState';
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

const TAB_IDS = TABS.map((t) => t.id);

/**
 * Which tab holds a given anchor — and this is the fix for a claim this file made and did not keep.
 *
 * The comment above says *"every section deep-linkable by fragment"*, and for five of the six corpora it
 * was **false**. The tab lived in `useState`, so `/reference#claim-s_hash` rendered the Glossary tab, the
 * element with that id was never in the DOM, and `useHashScroll` watched for it until its 5s deadline and
 * gave up — silently, because a fragment naming nothing is indistinguishable from a page that simply did
 * not scroll. Only `#glossary-*` worked, because glossary is the default tab.
 *
 * Nothing could see it: the anchors are rendered, so `check-docs.mjs` is satisfied; the ids exist in the
 * source, so a grep finds them; and no test navigated to one. It surfaced the moment the command palette
 * started emitting these fragments in earnest.
 *
 * The prefixes are the ones `utils/command-index.ts` builds and this file renders, in one mapping rather
 * than two — the same reason the index reads `claimDocs.ts` instead of restating it.
 */
function tabForAnchor(hash: string): Tab | null {
  const id = hash.replace(/^#/, '');
  if (id.startsWith('glossary-')) return 'glossary';
  if (id.startsWith('param-')) return 'authorize';
  if (id.startsWith('token-')) return 'token';
  if (id.startsWith('claim-')) return 'claims';
  if (id.startsWith('error-') || id.startsWith('authlete-')) return 'errors';
  return null;
}

function ReferencePage() {
  const { hash } = useLocation();
  /*
    `?tab=` in the URL, with the incoming **fragment** as the fallback rather than a constant.

    Two things had to be true at once. A tab has to be addressable — that is UX-08, and ten other sections
    already carry their selection in the URL through this hook. And an anchor has to select its own tab,
    so a link to an entry works whether or not whoever sent it knew about `?tab=`. Deriving the fallback
    from the hash gives both, and it means a bare `/reference#claim-nonce` — the shape the palette emits
    and the shape a person copies out of the address bar — resolves with no query string at all.

    The palette deliberately does **not** emit `?tab=`: the anchor prefix already implies the tab, and two
    encodings of one fact is how they come apart.
  */
  const [tab, setTab] = useUrlState('tab', TAB_IDS, tabForAnchor(hash) ?? 'glossary');
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

      {/*
        An `h2` for the selected section, so the outline is h1 → h2 → h3 rather than jumping.
        Two of the five tabs render their own `h2` group headings and three did not, which made
        `/reference` the one route whose headings skipped a level — caught by the Playwright outline check,
        which walks the real document rather than counting tags in JSX.
      */}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground m-0">
          {TABS.find((t) => t.id === tab)?.label}
        </h2>
        <p className="text-xs text-muted-foreground max-w-prose m-0">
          {TABS.find((t) => t.id === tab)?.blurb}
        </p>
      </div>

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
                <h3 className="text-sm font-semibold text-foreground m-0">{group.label}</h3>
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
                      level={4}
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
            <h3 className="text-sm font-semibold text-foreground m-0">Specification error codes</h3>
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
                    level={4}
                  />
                ))}
            </Section>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground m-0">
              Authlete result codes, reproduced against this deployment
            </h3>
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
                    level={4}
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

/** A heading at a level chosen by the caller. `h${level}` is not valid JSX; a tag variable is. */
function Heading({
  level,
  className,
  children,
}: {
  level: 3 | 4;
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = (level === 3 ? 'h3' : 'h4') as 'h3' | 'h4';
  return <Tag className={className}>{children}</Tag>;
}

interface EntryProps {
  id: string;
  title: string;
  /**
   * Heading depth, because it depends on context rather than on the component.
   *
   * Three of the five tabs list entries directly under the section `h2`, so those entries are `h3`. Two
   * group theirs under an `h3` — the parameter groups and the two error families — so those are `h4`.
   * Hard-coding either produced a skipped level on the other three, which a Playwright outline check
   * caught and a tag count in JSX never could.
   */
  level?: 3 | 4;
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
  level = 3,
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
        {/* `h4`: the outline is h1 (page) → h2 (section) → h3 (group, where a tab has them) → h4 (entry).
            Two tabs have group headings and three do not, so the entry sits one level deeper than the
            deepest heading above it either way — which is what the outline check verifies. */}
        <Heading level={level} className="text-xs font-mono font-semibold text-accent-text m-0">
          {/* A self-link, so any single entry can be shared rather than the whole page. */}
          <a href={`#${id}`} className="no-underline text-inherit hover:underline">
            {title}
          </a>
        </Heading>
        {badge && (
          <span className="text-2xs font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
            {badge}
          </span>
        )}
      </div>

      <Prose as="p" className="text-xs text-foreground-muted leading-relaxed max-w-prose m-0">
        {body}
      </Prose>

      {here && (
        <p className="text-xs text-muted-foreground leading-relaxed max-w-prose m-0">
          <span className="text-2xs uppercase tracking-wider text-muted-foreground">
            {hereLabel}:
          </span>{' '}
          <Prose>{here}</Prose>
        </p>
      )}

      {threat && (
        <p className="flex gap-1.5 text-xs text-foreground-muted leading-relaxed max-w-prose m-0 border-l-2 border-edge-warning pl-2">
          <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0 text-warning-text" />
          <span>
            <span className="text-2xs uppercase tracking-wider text-warning-text">
              {threatLabel}:
            </span>{' '}
            <Prose>{threat}</Prose>
          </span>
        </p>
      )}

      {/* `BookOpen`, not `Search`: a magnifying glass for a *specification citation* is the wrong idea,
          and at 11px it renders as a stray "Q" in front of the reference. Seen in a screenshot. */}
      <p className="flex gap-1.5 text-2xs text-muted-foreground font-mono m-0">
        <BookOpen className="h-2.5 w-2.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{spec}</span>
      </p>

      {footer}
    </article>
  );
}

export default ReferencePage;
