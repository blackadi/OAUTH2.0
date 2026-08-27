import { describe, it, expect } from 'vitest';
import { PLACEHOLDER_CLIENT_SECRET, secretOrEmpty, stripTrailingSlash } from '@/config';
import * as config from '@/config';

/**
 * The placeholder is not a credential.
 *
 * `.env.example` shipped `VITE_CLIENT_SECRET=your_client_secret` and `config.ts` used the same literal as
 * its default, so a deployment that configured nothing sent `client_secret=your_client_secret` on every
 * authorization-code exchange. For the SPA's own client — public, `tokenAuthMethod: NONE` — Authlete
 * refuses *any* client authentication data with `[A157303]`, so this broke the headline PKCE flow.
 *
 * This is the CI-visible half of the fix. `client/.env` is gitignored, so CI exercises the default and
 * never sees the literal; without this test the rule that recognises it would be untested where it runs.
 */
describe('secretOrEmpty', () => {
  it('treats the placeholder as no secret', () => {
    expect(secretOrEmpty(PLACEHOLDER_CLIENT_SECRET)).toBe('');
  });

  it('treats a padded placeholder as no secret', () => {
    // Copied out of a template by hand, a trailing space or newline is ordinary.
    expect(secretOrEmpty(`  ${PLACEHOLDER_CLIENT_SECRET}\n`)).toBe('');
  });

  it('passes a real secret through unchanged, whitespace included', () => {
    expect(secretOrEmpty('s3cr3t')).toBe('s3cr3t');
    // Not trimmed on the way through: a secret is compared byte for byte by the server, and silently
    // rewriting one would be its own hard-to-see failure.
    expect(secretOrEmpty(' s3cr3t ')).toBe(' s3cr3t ');
  });

  it('leaves an empty value empty', () => {
    expect(secretOrEmpty('')).toBe('');
  });
});

/**
 * `render.yaml` set `VITE_API_BASE_URL` to `https://oauth2-0-ekh2.onrender.com/`, and `config.ts` builds
 * 62 endpoints as `${API_BASE_URL}/api/...` — so every API call in the SPA addressed
 * `...onrender.com//api/...`. `new URL()` preserves the doubled slash and Express 5 answers 404.
 *
 * **This is the CI-visible half only, and the smaller half.** `client/.env` is gitignored, so CI builds
 * with the default `http://localhost:3000`, which never had a trailing slash — the constants guard below
 * therefore passes trivially where it runs and only catches a badly-set local value. The rule itself is
 * what CI can genuinely assert, so it is tested directly. The deploy manifest is asserted by
 * `scripts/check-client-server-contract.mjs`, which is the only place the original defect was reachable.
 */
describe('stripTrailingSlash', () => {
  it('removes a single trailing slash', () => {
    expect(stripTrailingSlash('https://example.com/')).toBe('https://example.com');
  });

  it('removes repeated trailing slashes', () => {
    expect(stripTrailingSlash('https://example.com///')).toBe('https://example.com');
  });

  it('leaves a slashless base untouched', () => {
    expect(stripTrailingSlash('https://example.com')).toBe('https://example.com');
  });

  it('leaves an interior path intact and strips only the tail', () => {
    expect(stripTrailingSlash('https://example.com/base/')).toBe('https://example.com/base');
  });

  it('does not mangle the scheme separator of a bare origin', () => {
    // The regex is anchored to the end, so `https://` is never a candidate.
    expect(stripTrailingSlash('https://')).toBe('https:');
  });

  it('leaves an empty value empty', () => {
    expect(stripTrailingSlash('')).toBe('');
  });
});

describe('endpoint constants', () => {
  it('never contain a doubled slash outside the scheme', () => {
    const offenders = Object.entries(config)
      // Narrow on the parameter, not on a binding pattern — TS1230 forbids the latter.
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .filter(([, v]) => /^https?:\/\//.test(v))
      // A `//` whose preceding character is not `:` is not the scheme separator.
      .filter(([, v]) => /[^:]\/\//.test(v))
      .map(([k, v]) => `${k}=${v}`);

    expect(offenders).toEqual([]);
  });
});
