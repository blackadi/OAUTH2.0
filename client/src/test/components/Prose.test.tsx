import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { Prose } from '@/components/ui/Prose';
import { AUTH_PARAMS } from '@/data/authParams';
import { TOKEN_PARAMS } from '@/data/tokenParams';
import { GLOSSARY } from '@/data/glossary';
import { CLAIM_DOCS } from '@/data/claimDocs';
import { OAUTH_ERRORS, AUTHLETE_NOTES } from '@/data/errorDocs';

/**
 * The inline markdown the data files are written in, and were not rendering.
 *
 * Every explanation in the corpus uses backticks around identifiers and asterisks around emphasis, and
 * every surface printed them as **literal characters** — `` Everything under `/api` `` appeared on screen
 * with the backticks showing. Valid text, correctly escaped, in the right element: typecheck, lint, 571
 * unit tests and an axe pass all green on a page full of stray punctuation. It took looking at a
 * screenshot.
 */

afterEach(cleanup);

describe('Prose', () => {
  it('renders a backticked identifier as code, without the backticks', () => {
    render(<Prose>{'Send `code_challenge` with the request'}</Prose>);
    const code = screen.getByText('code_challenge');
    expect(code.tagName).toBe('CODE');
    expect(document.body.textContent).not.toContain('`');
  });

  it('renders double asterisks as strong and single as emphasis', () => {
    render(<Prose>{'This is **important** and this is *subtle*'}</Prose>);
    expect(screen.getByText('important').tagName).toBe('STRONG');
    expect(screen.getByText('subtle').tagName).toBe('EM');
    expect(document.body.textContent).not.toContain('*');
  });

  it('keeps the surrounding text in order', () => {
    render(<Prose>{'before `mid` after'}</Prose>);
    expect(document.body.textContent).toBe('before mid after');
  });

  it('handles several runs in one string', () => {
    render(<Prose>{'`a` then **b** then `c`'}</Prose>);
    expect(screen.getByText('a').tagName).toBe('CODE');
    expect(screen.getByText('b').tagName).toBe('STRONG');
    expect(screen.getByText('c').tagName).toBe('CODE');
  });

  /**
   * A lone asterisk or backtick is text, not an unterminated delimiter. Some of the corpus discusses
   * wildcards and multiplication, and a greedy parser would swallow the rest of the sentence.
   */
  it('leaves an unpaired delimiter alone', () => {
    render(<Prose>{'2 * 3 and a stray ` here'}</Prose>);
    expect(document.body.textContent).toBe('2 * 3 and a stray ` here');
  });

  it('does not treat emphasis as spanning a line break', () => {
    render(<Prose>{'one *two\nthree* four'}</Prose>);
    expect(screen.queryByText('two\nthree')).not.toBeInTheDocument();
  });

  it('renders as a span by default and a p on request', () => {
    const { container, rerender } = render(<Prose>plain</Prose>);
    expect(container.firstElementChild?.tagName).toBe('SPAN');
    rerender(<Prose as="p">plain</Prose>);
    expect(container.firstElementChild?.tagName).toBe('P');
  });

  it('passes an empty string through without rendering anything odd', () => {
    const { container } = render(<Prose>{''}</Prose>);
    expect(container.textContent).toBe('');
  });
});

/**
 * The corpus itself: no explanation may reach a surface with an *unpaired* delimiter, because that is the
 * one case `Prose` cannot render and the reader sees a stray backtick.
 *
 * Counting rather than parsing, deliberately — an odd number of backticks in a string means one of them
 * has nothing to close.
 */
describe('the corpus is well-formed for inline rendering', () => {
  const strings: [string, string][] = [
    ...AUTH_PARAMS.flatMap((p) => [
      [`authParams.${p.name}.note`, p.note] as [string, string],
      ...(p.threat ? [[`authParams.${p.name}.threat`, p.threat] as [string, string]] : []),
    ]),
    ...TOKEN_PARAMS.flatMap((p) => [
      [`tokenParams.${p.name}.note`, p.note] as [string, string],
      [`tokenParams.${p.name}.failure`, p.failure] as [string, string],
    ]),
    ...GLOSSARY.flatMap((g) => [
      [`glossary.${g.term}.definition`, g.definition] as [string, string],
      ...(g.here ? [[`glossary.${g.term}.here`, g.here] as [string, string]] : []),
    ]),
    ...Object.entries(CLAIM_DOCS).map(
      ([k, d]) => [`claimDocs.${k}.note`, d.note] as [string, string],
    ),
    ...Object.entries(OAUTH_ERRORS).flatMap(([k, d]) => [
      [`oauthErrors.${k}.cause`, d.cause] as [string, string],
      ...(d.fix ? [[`oauthErrors.${k}.fix`, d.fix] as [string, string]] : []),
    ]),
    ...Object.entries(AUTHLETE_NOTES).flatMap(([k, d]) => [
      [`authleteNotes.${k}.cause`, d.cause] as [string, string],
      ...(d.fix ? [[`authleteNotes.${k}.fix`, d.fix] as [string, string]] : []),
    ]),
  ];

  it('has strings to check', () => {
    expect(strings.length).toBeGreaterThan(150);
  });

  it.each(strings)('%s has balanced backticks', (_name, text) => {
    expect((text.match(/`/g) ?? []).length % 2).toBe(0);
  });
});
