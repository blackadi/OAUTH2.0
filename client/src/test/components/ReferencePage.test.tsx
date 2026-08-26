import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, afterEach } from 'vitest';
import ReferencePage from '@/pages/ReferencePage';
import { GLOSSARY, glossarySlug } from '@/data/glossary';
import { AUTH_PARAMS } from '@/data/authParams';
import { TOKEN_PARAMS } from '@/data/tokenParams';

/**
 * The only reading surface in the application, and the reason it exists.
 *
 * Entries are `h4`, not `h3`: the outline is h1 (page) → h2 (the selected section) → h3 (a group, on the
 * two tabs that have them) → h4 (an entry). The section-level `h2` was added after a Playwright outline
 * check found `/reference` jumping h1 → h3 — the one route in the app whose headings skipped a level, and
 * invisible to a test that counts tags rather than walking the rendered document.
 *
 * All 20 pre-existing routes were *doing* surfaces — a parameter editor with a response pane. The
 * explanatory corpus was already written and shipped and reachable **only by clicking a 20px icon inside
 * a form**: 24 authorization parameters, 8 token parameters, 26 claims, 46 error codes. A learner sent a
 * link had nowhere to arrive except a form.
 *
 * These tests pin the two properties that make it a reading surface rather than another panel: it renders
 * without sending anything, and its content is the *same source* the interactive panels read — so a
 * correction cannot land in one place and not the other.
 */

afterEach(cleanup);

function mount(entry = '/reference') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ReferencePage />
    </MemoryRouter>,
  );
}

describe('ReferencePage', () => {
  it('renders as a page with its own h1, and sends no request', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1, name: /Reference/i })).toBeInTheDocument();
    // No fetch is mocked and none is needed: a reading surface reads.
  });

  it('opens on the glossary, which is where a novice needs to land', () => {
    mount();
    expect(screen.getByText(/no RFC defines/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Front channel' })).toBeInTheDocument();
  });

  /**
   * The terms the audit found defined nowhere, while all of them appeared in the interface copy. A
   * novice meeting "sender-constrain with DPoP" on their first screen had nowhere to look.
   */
  it.each([
    'Front channel',
    'Back channel',
    'Public client',
    'Confidential client',
    'Bearer token',
    'Sender-constrained token',
    'Resource owner',
    'Audience',
  ])('defines %s, which nothing in the app defined before', (term) => {
    mount();
    expect(screen.getByRole('heading', { level: 3, name: term })).toBeInTheDocument();
  });

  it('distinguishes a specification citation from a convention', () => {
    mount();
    // "Everyone says this" and "RFC 6749 §1.1 says this" are different kinds of claim, and a teaching
    // tool must not blur them. `front channel` is genuinely not defined by RFC 6749.
    const conventional = GLOSSARY.filter((e) => /conventional/i.test(e.spec)).map((e) => e.term);
    expect(conventional).toEqual(expect.arrayContaining(['Front channel', 'Back channel']));
    expect(screen.getAllByText(/Conventional — not defined by RFC 6749/).length).toBeGreaterThan(0);
  });

  it('gives every entry a fragment id, so a single definition can be shared', () => {
    const { container } = mount();
    for (const entry of GLOSSARY.slice(0, 5)) {
      const id = `glossary-${glossarySlug(entry.term)}`;
      expect(container.querySelector(`#${id}`)).toBeTruthy();
      // And the heading links to itself, which is what makes it shareable rather than merely anchored.
      expect(container.querySelector(`#${id} a[href="#${id}"]`)).toBeTruthy();
    }
  });

  it('reads the authorization parameters from the same module the builder uses', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Authorization request/i }));
    // `level: 4` here and `level: 3` elsewhere is the point: this tab groups its entries under an `h3`
    // per parameter group, so an entry sits one level deeper. Three of the five tabs have no grouping.
    for (const name of ['state', 'code_challenge', 'redirect_uri', 'dpop_jkt']) {
      expect(screen.getByRole('heading', { level: 4, name })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/RFC 7636/).length).toBeGreaterThan(0);
  });

  it('carries the attacker model into the reading surface too', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Authorization request/i }));
    // Always visible here, unlike the builder's on-demand toggle: reading is the whole purpose.
    expect(screen.getByText(/any page can start a flow in your browser/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Why it exists/i).length).toBeGreaterThan(0);
  });

  it('documents the token request, which had no surface at all', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Token request/i }));
    for (const p of TOKEN_PARAMS) {
      expect(screen.getByRole('heading', { level: 3, name: p.name })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/What breaks/i).length).toBe(TOKEN_PARAMS.length);
  });

  it('lists the vendor codes as reproduced here rather than read from a document', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Errors$/i }));
    expect(screen.getByText(/reproduced against this deployment/i)).toBeInTheDocument();
    // Grouped under "Specification error codes" / "…reproduced against this deployment", hence level 4.
    expect(screen.getByRole('heading', { level: 4, name: 'A157303' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'invalid_grant' })).toBeInTheDocument();
  });

  it('filters across every section rather than only the visible one', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'sender-constrained' } });
    expect(
      screen.getByRole('heading', { level: 3, name: 'Sender-constrained token' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Resource owner' }),
    ).not.toBeInTheDocument();
  });

  it('says so when a filter matches nothing, rather than showing an empty frame', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'zzzznotathing' } });
    expect(screen.getByText(/Nothing matches that filter/i)).toBeInTheDocument();
  });

  it('cross-references related terms, so the glossary is navigable rather than a list', () => {
    mount();
    expect(screen.getAllByText(/See also:/).length).toBeGreaterThan(5);
  });
});

describe('the glossary data itself', () => {
  it('gives every term a citation and a definition', () => {
    for (const entry of GLOSSARY) {
      expect(entry.spec.length).toBeGreaterThan(0);
      expect(entry.definition.length).toBeGreaterThan(30);
    }
  });

  it('produces a unique, URL-safe slug per term', () => {
    const slugs = GLOSSARY.map((e) => glossarySlug(e.term));
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('only cross-references terms that exist', () => {
    const terms = new Set(GLOSSARY.map((e) => e.term));
    for (const entry of GLOSSARY) {
      for (const ref of entry.see ?? []) {
        expect(terms, `${entry.term} → ${ref}`).toContain(ref);
      }
    }
  });

  it('covers the jargon the interface actually uses', () => {
    // Drawn from the audit's list of terms that appeared in UI copy and were defined nowhere.
    const required = [
      'Front channel',
      'Back channel',
      'Public client',
      'Confidential client',
      'Bearer token',
      'Sender-constrained token',
      'Audience',
      'Claim',
      'Resource owner',
      'Resource server',
      'PKCE',
      'DPoP',
      'private_key_jwt',
    ];
    const terms = GLOSSARY.map((e) => e.term);
    expect(terms).toEqual(expect.arrayContaining(required));
  });

  it('does not duplicate a parameter name as a glossary term', () => {
    // The reference has a section for parameters; a term that shadows one would give the same word two
    // definitions in the same page.
    const paramNames = new Set(AUTH_PARAMS.map((p) => p.name));
    for (const entry of GLOSSARY) {
      expect(paramNames.has(entry.term)).toBe(false);
    }
  });
});

describe('an anchor selects its own tab', () => {
  /**
   * The defect this closes, and it had been true since the page was written.
   *
   * The file's own doc comment claims *"every section deep-linkable by fragment"*. For five of the six
   * corpora it was **false**: the tab lived in `useState`, so `/reference#claim-s_hash` rendered the
   * Glossary tab, the element with that id was never in the DOM, and `useHashScroll` watched for it until
   * its 5s deadline and gave up — silently, because a fragment naming nothing is indistinguishable from a
   * page that simply did not scroll. Only `#glossary-*` worked, because glossary is the default.
   *
   * Nothing could see it. The anchors *are* rendered, so `check-docs.mjs` is satisfied and a grep finds
   * every id. It surfaced only when the command palette started emitting these fragments in earnest —
   * which is also why this mapping is now the contract two files depend on and gets a case per prefix.
   */
  it.each([
    ['#glossary-authorization-server', 'Glossary'],
    ['#param-code_challenge', 'Authorization request'],
    ['#token-code_verifier', 'Token request'],
    ['#claim-s_hash', 'JWT claims'],
    ['#error-invalid_grant', 'Errors'],
    ['#authlete-A157303', 'Errors'],
  ])('opens %s on the %s tab', (hash, label) => {
    mount(`/reference${hash}`);
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-current', 'true');
    // And the anchor is actually in the document, which is the half that was missing.
    expect(document.getElementById(hash.slice(1))).not.toBeNull();
  });

  it('falls back to the glossary for a fragment it does not recognise', () => {
    // A stale or hand-edited fragment should land somewhere legible rather than on an empty page.
    mount('/reference#something-else');
    expect(screen.getByRole('button', { name: 'Glossary' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('lets ?tab= win over the fragment, so a chosen tab is addressable', () => {
    /*
      Both are honoured, and the precedence is deliberate. `?tab=` is what clicking a tab writes, so it
      represents a decision made *after* arriving; the fragment is only the fallback. That ordering is what
      lets somebody land on an entry, switch tabs to read something else, and copy a URL that reopens what
      they were actually looking at.
    */
    mount('/reference?tab=errors#claim-s_hash');
    expect(screen.getByRole('button', { name: 'Errors' })).toHaveAttribute('aria-current', 'true');
  });

  it('ignores a ?tab= value that is not a tab', () => {
    mount('/reference?tab=nonsense');
    expect(screen.getByRole('button', { name: 'Glossary' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});
