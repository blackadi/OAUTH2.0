import { GLOSSARY, glossarySlug } from '@/data/glossary';
import { AUTH_PARAMS } from '@/data/authParams';
import { TOKEN_PARAMS } from '@/data/tokenParams';
import { CLAIM_DOCS } from '@/data/claimDocs';
import { OAUTH_ERRORS, AUTHLETE_NOTES } from '@/data/errorDocs';
import type { SectionGroup } from '@/App';

/**
 * One searchable index over everything this app can take you to, for the command palette.
 *
 * **Why an index rather than a search box per surface.** The reading corpus is already written, cited and
 * CI-gated — 24 authorization parameters, 6 token-request parameters, 26 claims, 20 specification error
 * codes, 18 Authlete codes, a glossary — and `/reference` renders all of it with a per-entry anchor. What
 * it did not have was a way in. Finding out what `s_hash` means meant knowing that `/reference` exists,
 * going there, and scrolling; finding `[A157303]` meant the same. Twenty-two sections had the same
 * problem one level up: the sidebar is the only route to them and it does not fit on screen.
 *
 * So the palette searches **the data, not the pages**, and every hit is a `to` that already existed. No
 * content is authored here and none is duplicated: rename an anchor in `ReferencePage` and the entry that
 * breaks is this one, in one place.
 *
 * **Deliberately no destructive commands.** Clearing the vault, revoking a token and deleting a client
 * are all one fuzzy-matched keystroke from a misfire, and a palette is the one surface where you are
 * typing fast at a list you have not finished reading. Those keep their typed confirmations where they
 * are, behind a deliberate click. See `ConfirmDialog` on why the strong form exists.
 */

export type CommandKind =
  'action' | 'section' | 'glossary' | 'param' | 'token-param' | 'claim' | 'error' | 'vendor';

export interface Command {
  /** Stable and unique across the whole index; also the DOM id of its option row. */
  id: string;
  kind: CommandKind;
  /** The row's own label, and the field that scores highest. */
  title: string;
  /** One short line under the title — usually the spec reference or the human name. */
  subtitle?: string;
  /** Searchable prose that is *not* rendered as the label: the note, the definition, the cause. */
  detail?: string;
  /** Extra search terms — spelled-out forms and the words people actually type. */
  keywords?: string[];
  /** A route, optionally with a `#fragment`. Exactly one of `to` and `run` is set. */
  to?: string;
  run?: () => void;
}

export interface CommandGroup {
  kind: CommandKind;
  label: string;
  commands: Command[];
}

const KIND_LABEL: Record<CommandKind, string> = {
  action: 'Actions',
  section: 'Go to',
  glossary: 'Glossary',
  param: 'Authorization request',
  'token-param': 'Token request',
  claim: 'Claims',
  error: 'OAuth errors',
  vendor: 'Authlete codes',
};

/** Only used to break a genuine score tie, and to order the default (empty-query) list. */
const KIND_ORDER: CommandKind[] = [
  'action',
  'section',
  'glossary',
  'param',
  'token-param',
  'claim',
  'error',
  'vendor',
];

/** The reference entries, built from the same data the page renders and anchored to the same ids. */
export function buildReferenceCommands(): Command[] {
  const commands: Command[] = [];

  for (const entry of GLOSSARY) {
    commands.push({
      id: `glossary-${glossarySlug(entry.term)}`,
      kind: 'glossary',
      title: entry.term,
      subtitle: entry.spec,
      detail: `${entry.definition} ${entry.here ?? ''} ${(entry.see ?? []).join(' ')}`,
      to: `/reference#glossary-${glossarySlug(entry.term)}`,
    });
  }

  for (const param of AUTH_PARAMS) {
    commands.push({
      id: `param-${param.name}`,
      kind: 'param',
      title: param.name,
      subtitle: `${param.label} · ${param.spec}`,
      // `threat` is searchable, which is most of the point of having written it: someone who types
      // "mix-up" or "injection" should land on the parameter that prevents it.
      detail: `${param.note} ${param.threat ?? ''} ${param.requirement ?? ''}`,
      to: `/reference#param-${param.name}`,
    });
  }

  for (const param of TOKEN_PARAMS) {
    commands.push({
      id: `token-${param.name}`,
      kind: 'token-param',
      title: param.name,
      subtitle: param.spec,
      detail: `${param.note} ${param.failure} ${param.requirement}`,
      to: `/reference#token-${param.name}`,
    });
  }

  for (const [name, doc] of Object.entries(CLAIM_DOCS)) {
    commands.push({
      id: `claim-${name}`,
      kind: 'claim',
      title: name,
      subtitle: `${doc.name} · ${doc.spec}`,
      detail: doc.note,
      to: `/reference#claim-${name}`,
    });
  }

  for (const [code, doc] of Object.entries(OAUTH_ERRORS)) {
    commands.push({
      id: `error-${code}`,
      kind: 'error',
      title: code,
      subtitle: doc.spec,
      detail: `${doc.cause} ${doc.fix ?? ''}`,
      to: `/reference#error-${code}`,
    });
  }

  for (const [code, doc] of Object.entries(AUTHLETE_NOTES)) {
    commands.push({
      id: `authlete-${code}`,
      kind: 'vendor',
      // Bracketed, because that is how the code appears in a response and therefore how it gets pasted.
      title: `[${code}]`,
      subtitle: doc.verifiedHere ? `${doc.spec} · reproduced here` : doc.spec,
      detail: `${code} ${doc.cause} ${doc.fix ?? ''}`,
      keywords: [code],
      to: `/reference#authlete-${code}`,
    });
  }

  return commands;
}

/** The twenty-two sections, from the same table that builds the sidebar. */
export function buildSectionCommands(groups: SectionGroup[]): Command[] {
  return groups.flatMap((group) =>
    group.sections.map((section) => ({
      id: `section-${section.id}`,
      kind: 'section' as const,
      title: section.label,
      subtitle: group.label,
      // The group name is searchable so "admin" finds all four admin sections, and the path so somebody
      // who knows the URL can type it.
      keywords: [group.label, section.path.replace(/^\//, '')],
      to: section.path,
    })),
  );
}

/** First letters of each word: what makes "gf" reach "Grant Flows" in two keystrokes. */
function initials(text: string): string {
  return text
    .split(/[\s_\-./[\]]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toLowerCase();
}

/** True when `token` begins a word inside `text` — "flows" should reach "Grant Flows". */
function startsAWord(text: string, token: string): boolean {
  return new RegExp(`(^|[\\s_\\-./\\[])${escapeRegExp(token)}`).test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * How a query scores against one command, or `null` when it does not match at all.
 *
 * Two decisions worth stating, because both are visible in what the palette feels like:
 *
 * - **Every whitespace-separated token must match something — AND, not OR.** `nonce replay` should
 *   narrow to the one entry about replay, not widen to everything mentioning either word. A palette that
 *   widens as you type more is a palette you stop typing into.
 * - **Where a token matched matters more than how many matched.** A hit in the title outranks a hit in
 *   the prose by an order of magnitude, so typing `iss` puts the `iss` claim above the fifteen entries
 *   whose notes discuss issuers. The weights are coarse on purpose: a fine-grained relevance model that
 *   nobody can predict is worse than a blunt one that everybody can.
 */
export function scoreCommand(query: string, command: Command): number | null {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  const title = command.title.toLowerCase();
  const keywords = (command.keywords ?? []).join(' ').toLowerCase();
  const subtitle = (command.subtitle ?? '').toLowerCase();
  const detail = (command.detail ?? '').toLowerCase();
  const titleInitials = initials(command.title);

  let total = 0;
  for (const token of tokens) {
    let best = 0;
    if (title === token) best = 400;
    else if (title.startsWith(token)) best = 250;
    else if (startsAWord(title, token)) best = 180;
    else if (tokens.length === 1 && token.length >= 2 && titleInitials.startsWith(token))
      best = 160;
    else if (title.includes(token)) best = 120;
    else if (keywords.includes(token)) best = 70;
    else if (subtitle.includes(token)) best = 40;
    else if (detail.includes(token)) best = 15;

    if (best === 0) return null;
    total += best;
  }

  // A shorter title that matched the same way is the more specific answer: `iss` over `issuer`. Capped,
  // so it only ever breaks ties rather than outweighing where the match landed.
  return total - Math.min(20, command.title.length / 3);
}

/**
 * Search the index and return the results *both* ways they are needed, from one pass.
 *
 * `groups` is what gets rendered; `flat` is the keyboard order. Returning them together is what
 * guarantees they agree — computing the visual order in the component and the arrow-key order in a hook
 * is how the highlighted row and the row that Enter opens come apart.
 *
 * **Groups are ordered by their best member, not by a fixed category order.** That is what keeps the
 * contract "type, then press Enter" true: the first row of the first group is always the top-scoring
 * result. A fixed order would put a weak Glossary hit above a strong Claims hit purely because glossary
 * comes first in the list, and Enter would open the wrong thing.
 */
export function searchCommands(
  query: string,
  commands: Command[],
  limit = 40,
): { groups: CommandGroup[]; flat: Command[] } {
  const trimmed = query.trim();

  const selected: { command: Command; score: number }[] = [];
  if (trimmed === '') {
    // An empty query is not "no results" — it is "where can I go?". Actions and sections only, in their
    // authored order, because the reference corpus is 100+ entries and an unfiltered dump of it teaches
    // nothing.
    for (const command of commands) {
      if (command.kind === 'action' || command.kind === 'section') {
        selected.push({ command, score: 0 });
      }
    }
    // Sorted by category rather than left in whatever order the caller assembled the index. Depending on
    // the argument order would make the default view of the palette a property of one call site.
    selected.sort(
      (a, b) => KIND_ORDER.indexOf(a.command.kind) - KIND_ORDER.indexOf(b.command.kind),
    );
  } else {
    for (const command of commands) {
      const score = scoreCommand(trimmed, command);
      if (score !== null) selected.push({ command, score });
    }
    selected.sort(
      (a, b) =>
        b.score - a.score ||
        KIND_ORDER.indexOf(a.command.kind) - KIND_ORDER.indexOf(b.command.kind) ||
        a.command.title.localeCompare(b.command.title),
    );
  }

  const capped = selected.slice(0, limit);

  const byKind = new Map<CommandKind, Command[]>();
  for (const { command } of capped) {
    const bucket = byKind.get(command.kind);
    if (bucket) bucket.push(command);
    else byKind.set(command.kind, [command]);
  }

  // Insertion order of the Map is already best-first, because `capped` is sorted — so iterating it gives
  // groups ordered by their best member with no second sort.
  const groups: CommandGroup[] = [...byKind.entries()].map(([kind, groupCommands]) => ({
    kind,
    label: KIND_LABEL[kind],
    commands: groupCommands,
  }));

  return { groups, flat: groups.flatMap((group) => group.commands) };
}

/** Exposed so the palette and its tests name the categories the same way. */
export { KIND_LABEL };
