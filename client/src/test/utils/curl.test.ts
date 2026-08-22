import { describe, it, expect } from 'vitest';
import { toCurl } from '@/utils/curl';

const request = {
  method: 'post',
  url: 'https://as.example/token',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic c2VjcmV0' },
  body: 'grant_type=client_credentials&client_secret=s3cr3t',
};

describe('toCurl', () => {
  it('redacts credentials by default — a copied command gets pasted places', () => {
    const out = toCurl(request);
    expect(out).not.toContain('c2VjcmV0');
    expect(out).not.toContain('s3cr3t');
    expect(out).toContain('Basic ●●●●●●');
  });

  it('includes them only when explicitly asked', () => {
    const out = toCurl(request, { revealSecrets: true });
    expect(out).toContain('Basic c2VjcmV0');
    expect(out).toContain('s3cr3t');
  });

  it('upper-cases the method and keeps the URL last, as curl expects', () => {
    const out = toCurl(request);
    expect(out.startsWith('curl -X POST')).toBe(true);
    expect(out.trimEnd().endsWith(`'https://as.example/token'`)).toBe(true);
  });

  it('escapes a single quote in the body instead of producing a broken command', () => {
    // Legal in a login_hint, a binding_message or a RAR document. The previous inline builder wrapped
    // the body in single quotes with no escaping, so this silently truncated the argument.
    const out = toCurl({
      method: 'POST',
      url: 'https://as.example/par',
      body: `login_hint=o'brien`,
    });
    expect(out).toContain(`'login_hint=o'\\''brien'`);
  });

  it('escapes a single quote in a header value and in the URL', () => {
    const out = toCurl({
      method: 'GET',
      url: `https://as.example/x?q=o'brien`,
      headers: { 'X-Note': `it's fine` },
    });
    expect(out).toContain(`'X-Note: it'\\''s fine'`);
    expect(out).toContain(`'https://as.example/x?q=o'\\''brien'`);
  });

  it('omits the -d flag when there is no body', () => {
    expect(toCurl({ method: 'GET', url: 'https://as.example/x' })).not.toContain('-d');
  });
});
