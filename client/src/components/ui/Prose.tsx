import { type ReactNode } from 'react';

/**
 * Render the inline markdown the data files are written in.
 *
 * **Found by looking at the rendered page.** Every explanation in `authParams.ts`, `tokenParams.ts`,
 * `claimDocs.ts`, `errorDocs.ts` and `glossary.ts` is written with backticks around identifiers and
 * asterisks around emphasis — hundreds of them — and every surface rendered those as **literal
 * characters**: `` Everything under `/api` that is not admin `` appeared on screen with the backticks
 * showing, and *"the specification calls them the \*end-user\*"* with the asterisks showing.
 *
 * No gate could see it. It is valid text, correctly escaped, in the right element; typecheck, lint, 571
 * unit tests and axe all pass on a page full of stray punctuation. It took a screenshot.
 *
 * **Deliberately not a markdown library, and deliberately not `innerHTML`.** This renders React elements
 * from a tokenised string, so there is no HTML parsing anywhere near it — which matters because some of
 * these strings interpolate values that came from an authorization server. A full markdown parser would
 * also bring block-level constructs this text does not use and cannot use inside a `<span>`.
 *
 * Supports exactly what the corpus contains:
 *
 * - `` `code` `` → a monospace span
 * - `**strong**` → bold
 * - `*emphasis*` → italic
 */

/** Split on the three inline forms at once, keeping the delimiters so each run can be typed. */
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;

export function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((chunk, i) => {
    if (!chunk) return null;

    if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
      return (
        <code key={i} className="font-mono text-accent-text">
          {chunk.slice(1, -1)}
        </code>
      );
    }
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    // A single `*…*` — but not a bare asterisk, and not something that spans a line break.
    if (chunk.startsWith('*') && chunk.endsWith('*') && chunk.length > 2) {
      return <em key={i}>{chunk.slice(1, -1)}</em>;
    }
    return chunk;
  });
}

interface ProseProps {
  children: string;
  className?: string;
  /** The element to render. A `span` by default, so it can sit inside an existing paragraph. */
  as?: 'span' | 'p';
  /**
   * Needed whenever this prose is the *target* of an `aria-describedby` — a field hint, a help body.
   * Without it the describing element cannot be referenced and the description reaches only the sighted
   * reader, which is the half that needed it least.
   */
  id?: string;
}

/** One explanation string, with its inline markup honoured. */
export function Prose({ children, className, as: Tag = 'span', id }: ProseProps) {
  return (
    <Tag className={className} id={id}>
      {renderInline(children)}
    </Tag>
  );
}
