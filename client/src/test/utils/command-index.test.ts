import { describe, it, expect } from 'vitest';
import {
  buildReferenceCommands,
  buildSectionCommands,
  scoreCommand,
  searchCommands,
  type Command,
} from '@/utils/command-index';
import { GLOSSARY, glossarySlug } from '@/data/glossary';
import { AUTH_PARAMS } from '@/data/authParams';
import { CLAIM_DOCS } from '@/data/claimDocs';
import { OAUTH_ERRORS, AUTHLETE_NOTES } from '@/data/errorDocs';
import { TOKEN_PARAMS } from '@/data/tokenParams';

const REFERENCE = buildReferenceCommands();

const SECTIONS = buildSectionCommands([
  {
    label: 'OAuth 2.0',
    sections: [
      { id: 'auth-flows', label: 'Grant Flows', path: '/auth-flows', icon: null },
      { id: 'token-ops', label: 'Token Operations', path: '/token-ops', icon: null },
    ],
  },
  {
    label: 'Admin',
    sections: [
      { id: 'client-mgmt', label: 'Client Management', path: '/client-management', icon: null },
    ],
  },
] as Parameters<typeof buildSectionCommands>[0]);

function find(id: string): Command {
  const command = [...REFERENCE, ...SECTIONS].find((c) => c.id === id);
  if (!command) throw new Error(`no command with id ${id}`);
  return command;
}

describe('the index covers every source it claims to', () => {
  /**
   * Counted from the data rather than hard-coded, on purpose.
   *
   * A literal here would need editing every time somebody documents another claim, and the version that
   * gets edited under time pressure is the assertion, not the code. Deriving it means adding an entry to
   * `claimDocs.ts` cannot silently fail to appear in the palette.
   */
  it('indexes all six corpora', () => {
    const count = (kind: string) => REFERENCE.filter((c) => c.kind === kind).length;
    expect(count('glossary')).toBe(GLOSSARY.length);
    expect(count('param')).toBe(AUTH_PARAMS.length);
    expect(count('token-param')).toBe(TOKEN_PARAMS.length);
    expect(count('claim')).toBe(Object.keys(CLAIM_DOCS).length);
    expect(count('error')).toBe(Object.keys(OAUTH_ERRORS).length);
    expect(count('vendor')).toBe(Object.keys(AUTHLETE_NOTES).length);
  });

  it('gives every command a unique id and exactly one destination', () => {
    const all = [...REFERENCE, ...SECTIONS];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const command of all) {
      // `to` xor `run`. A command with neither is a row that does nothing when you press Enter on it.
      expect(Boolean(command.to) !== Boolean(command.run), command.id).toBe(true);
    }
  });

  /**
   * The anchors are the contract between this index and `ReferencePage`, and it is a contract nothing
   * else can check: the page builds `id={`claim-${name}`}` and this builds `to={`/reference#claim-...`}`
   * from the same data, independently. If one side is renamed the palette navigates to a fragment that
   * matches nothing and `useHashScroll` silently gives up after its 5s deadline.
   */
  it('anchors every reference entry at the id ReferencePage renders', () => {
    expect(find(`glossary-${glossarySlug(GLOSSARY[0].term)}`).to).toBe(
      `/reference#glossary-${glossarySlug(GLOSSARY[0].term)}`,
    );
    expect(find('claim-nonce').to).toBe('/reference#claim-nonce');
    expect(find('param-code_challenge').to).toBe('/reference#param-code_challenge');
    expect(find('error-invalid_grant').to).toBe('/reference#error-invalid_grant');
    expect(find('authlete-A157303').to).toBe('/reference#authlete-A157303');
  });

  it('titles an Authlete code the way a response prints it', () => {
    // `[A157303]` is how it arrives in a `responseContent` and therefore how it gets pasted into a
    // search box. The bare code is a keyword so both spellings find it.
    const command = find('authlete-A157303');
    expect(command.title).toBe('[A157303]');
    expect(scoreCommand('A157303', command)).not.toBeNull();
    expect(scoreCommand('[A157303]', command)).not.toBeNull();
  });
});

describe('scoring', () => {
  it('ranks an exact title above a prose mention', () => {
    const claim = find('claim-nonce');
    const other = REFERENCE.filter(
      (c) => c.id !== 'claim-nonce' && (c.detail ?? '').toLowerCase().includes('nonce'),
    );
    expect(other.length).toBeGreaterThan(0);
    const exact = scoreCommand('nonce', claim)!;
    for (const command of other) {
      const score = scoreCommand('nonce', command);
      if (score !== null && !command.title.toLowerCase().includes('nonce')) {
        expect(score, `${command.id} outranked an exact title match`).toBeLessThan(exact);
      }
    }
  });

  it('requires every token to match — AND, not OR', () => {
    const claim = find('claim-nonce');
    expect(scoreCommand('nonce', claim)).not.toBeNull();
    // The second word matches nothing on this entry, so the whole query must not match it. A palette
    // that widens as you type more is one you stop typing into.
    expect(scoreCommand('nonce zzzznothing', claim)).toBeNull();
  });

  it('matches initials for a two-keystroke jump', () => {
    // "cm" appears nowhere in "Client Management" as a substring; the initials are the whole point.
    const section = find('section-client-mgmt');
    expect(section.title.toLowerCase().includes('cm')).toBe(false);
    expect(scoreCommand('cm', section)).not.toBeNull();
  });

  it('treats initials as a whole-query shorthand, and only when they explain it', () => {
    /*
      Bare commands with no keywords, subtitle or detail, so the title is the only thing a query can
      match. That isolation matters: a first attempt at this test used a real section command and passed
      for the wrong reason — "c" was matching `client-management` in the *keywords*, not the initials.

      A single character is deliberately not tested for initials, because for one character the rule is
      unobservable: every initial is by definition word-initial, so `startsAWord` already matches it.
      Two characters is where initials start saying something a substring search cannot.
    */
    const bare: Command = { id: 'y', kind: 'section', title: 'Zulu Bravo', to: '/y' };
    expect(bare.title.toLowerCase().includes('zb')).toBe(false);
    expect(scoreCommand('zb', bare)).not.toBeNull();

    // Initials are ordered. "bz" is not a shorthand for anything.
    expect(scoreCommand('bz', bare)).toBeNull();

    // And they are a *whole-query* shorthand: once you have typed a second word you meant words.
    expect(scoreCommand('zb zulu', bare)).toBeNull();

    // An initials hit ranks below a real prefix of the title, so typing more of the actual name wins.
    expect(scoreCommand('zb', bare)!).toBeLessThan(scoreCommand('zulu', bare)!);
  });

  it('prefers the shorter of two titles that matched the same way', () => {
    const short: Command = { id: 'a', kind: 'claim', title: 'iss', to: '/x' };
    const long: Command = { id: 'b', kind: 'claim', title: 'issuer_identifier', to: '/y' };
    expect(scoreCommand('iss', short)!).toBeGreaterThan(scoreCommand('iss', long)!);
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    const claim = find('claim-nonce');
    expect(scoreCommand('  NONCE  ', claim)).toBe(scoreCommand('nonce', claim));
  });
});

describe('searchCommands', () => {
  const ALL = [...SECTIONS, ...REFERENCE];

  it('offers somewhere to go when the query is empty, not everything', () => {
    const { flat, groups } = searchCommands('', ALL);
    // Sections only. Dumping 100+ reference entries at somebody who has typed nothing teaches nothing.
    expect(flat.every((c) => c.kind === 'section' || c.kind === 'action')).toBe(true);
    expect(groups.map((g) => g.kind)).toEqual(['section']);
  });

  it('keeps groups and keyboard order in agreement', () => {
    const { groups, flat } = searchCommands('token', ALL);
    expect(flat).toEqual(groups.flatMap((g) => g.commands));
  });

  /**
   * The contract the whole palette rests on: **type, then press Enter**.
   *
   * Groups are ordered by their best member rather than by a fixed category order, so the first row of
   * the first group is always the top-scoring result. A fixed order would put a weak Glossary hit above a
   * strong Claims hit purely because glossary sorts first, and Enter would open the wrong thing.
   */
  it('puts the best match first overall, not first within a fixed category order', () => {
    const { flat } = searchCommands('s_hash', ALL);
    expect(flat[0].id).toBe('claim-s_hash');

    const sections = searchCommands('client management', ALL);
    expect(sections.flat[0].id).toBe('section-client-mgmt');
  });

  it('caps the result count', () => {
    // "the" appears in a great deal of the prose; without a cap the list would be unusable and the
    // scroll container would render 100+ rows on every keystroke.
    const { flat } = searchCommands('e', ALL, 12);
    expect(flat.length).toBeLessThanOrEqual(12);
  });

  it('returns nothing rather than everything for a query that matches nothing', () => {
    const { flat, groups } = searchCommands('zzzznotathing', ALL);
    expect(flat).toEqual([]);
    expect(groups).toEqual([]);
  });

  it('finds a parameter by the attack it prevents', () => {
    /*
      `threat` was added to `authParams.ts` because the words `attack` and `attacker` appeared zero times
      in ~2,100 lines of teaching prose. Indexing that field is what makes it reachable: somebody who
      knows the attack but not the parameter name can start from the attack. `redirect_uri`'s threat is
      the only place "open redirect" is written down, so this asserts the whole path — index the field,
      match the phrase, land on the parameter.
    */
    const { flat } = searchCommands('open redirect', ALL);
    expect(flat.some((c) => c.id === 'param-redirect_uri')).toBe(true);
  });

  it('finds the parameter that stops a replay', () => {
    const { flat } = searchCommands('replayed', ALL);
    expect(flat.some((c) => c.id === 'param-nonce')).toBe(true);
  });
});
