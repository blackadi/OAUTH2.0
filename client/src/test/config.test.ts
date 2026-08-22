import { describe, it, expect } from 'vitest';
import { PLACEHOLDER_CLIENT_SECRET, secretOrEmpty } from '@/config';

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
