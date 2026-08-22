/**
 * `JSON.parse` that returns `unknown` instead of `any`, plus the two narrowings this app needs.
 *
 * **Why.** `JSON.parse` is typed as returning `any`, and `any` is contagious: it disables checking on
 * everything it touches, silently and transitively. Turning on type-aware linting surfaced 25 sites
 * where a parsed value flowed straight into something that mattered — a `crypto.subtle.importKey` call
 * receiving a signing key, a `client_secret` read off an unchecked object, a step-up challenge handed to
 * `setState` with no idea what shape it had. Every one of them looked fine and none of them was checked.
 *
 * The fix is not a cast. A cast asserts a shape the value may not have; these functions **ask**, and
 * return `null` when the answer is no. That also removes the second problem with bare `JSON.parse`: it
 * *throws* on malformed input, so a corrupted `sessionStorage` entry surfaced as whatever the
 * surrounding `catch` happened to say rather than as "that stored value is not JSON".
 */

/** Parse, or `null`. Never throws, never returns `any`. */
export function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Parse a JSON **object**, or `null`.
 *
 * Arrays and primitives are valid JSON and are not objects, so `typeof x === 'object'` alone is not the
 * check — `null` passes it and an array passes it. Callers here always want a bag of named members.
 */
export function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

/** Read a string member off an unknown object, or `undefined`. */
export function stringMember(source: unknown, ...names: string[]): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const bag = source as Record<string, unknown>;
  for (const name of names) {
    const value = bag[name];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}
