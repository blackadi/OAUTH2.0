import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JwtInspector, __resetJwksCache } from '@/components/ui/JwtInspector';
import { tokenService } from '@/services';

const enc = new TextEncoder();

function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
const b64urlJson = (v: unknown) => b64url(enc.encode(JSON.stringify(v)));

async function signed(payload: Record<string, unknown>) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const head = b64urlJson({ alg: 'ES256', typ: 'JWT', kid: 'k1' });
  const body = b64urlJson(payload);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    enc.encode(`${head}.${body}`),
  );
  return { token: `${head}.${body}.${b64url(sig)}`, jwk: { ...jwk, kid: 'k1' } };
}

beforeEach(() => __resetJwksCache());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('JwtInspector', () => {
  it('shows the algorithm and typ from the header', async () => {
    const { token } = await signed({ sub: 'alice' });
    render(<JwtInspector token={token} />);
    expect(screen.getByText('ES256')).toBeInTheDocument();
    expect(screen.getByText('typ: JWT')).toBeInTheDocument();
  });

  it('starts as unverified, because a legible payload is not an authenticated one', async () => {
    const { token } = await signed({ sub: 'alice' });
    render(<JwtInspector token={token} />);
    expect(screen.getByText('unverified')).toBeInTheDocument();
  });

  it('verifies against the JWKS on request', async () => {
    const { token, jwk } = await signed({ sub: 'alice' });
    vi.spyOn(tokenService, 'getJwks').mockResolvedValue({ keys: [jwk] } as never);

    render(<JwtInspector token={token} />);
    fireEvent.click(screen.getByRole('button', { name: /Verify signature/i }));

    await waitFor(() => expect(screen.getByText(/signature valid/)).toBeInTheDocument());
    expect(screen.getByText(/kid k1/)).toBeInTheDocument();
  });

  it('reports a tampered token as INVALID', async () => {
    const { token, jwk } = await signed({ sub: 'alice' });
    const [head, , sig] = token.split('.');
    const forged = `${head}.${b64urlJson({ sub: 'attacker' })}.${sig}`;
    vi.spyOn(tokenService, 'getJwks').mockResolvedValue({ keys: [jwk] } as never);

    render(<JwtInspector token={forged} />);
    fireEvent.click(screen.getByRole('button', { name: /Verify signature/i }));

    await waitFor(() => expect(screen.getByText(/signature INVALID/)).toBeInTheDocument());
  });

  it('distinguishes an unfetchable JWKS from a bad signature', async () => {
    const { token } = await signed({ sub: 'alice' });
    vi.spyOn(tokenService, 'getJwks').mockRejectedValue(new Error('502 Bad Gateway'));

    render(<JwtInspector token={token} />);
    fireEvent.click(screen.getByRole('button', { name: /Verify signature/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Could not check the signature: 502 Bad Gateway/),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/signature INVALID/)).toBeNull();
  });

  it('shows an expiry countdown, and marks an expired token', async () => {
    const past = await signed({ sub: 'a', exp: Math.floor(Date.now() / 1000) - 120 });
    render(<JwtInspector token={past.token} />);
    expect(screen.getByText(/expired 2m ago/)).toBeInTheDocument();
  });

  it('glosses claims rather than only printing them', async () => {
    const { token } = await signed({ sub: 'alice', aud: 'client-1' });
    render(<JwtInspector token={token} defaultOpen />);
    expect(screen.getByText(/Who the token is about/i)).toBeInTheDocument();
    expect(screen.getByText(/Reject a token whose audience is not you/i)).toBeInTheDocument();
  });

  it('renders time claims as an instant, not a bare integer', async () => {
    const iat = 1_700_000_000;
    const { token } = await signed({ sub: 'a', iat });
    render(<JwtInspector token={token} defaultOpen />);
    expect(screen.getByText(new RegExp(new Date(iat * 1000).toISOString()))).toBeInTheDocument();
  });

  it('treats an opaque token as normal rather than as a defect', () => {
    render(<JwtInspector token="2YotnFZFEjr1zCsicMWpAA" />);
    expect(screen.getByText(/Not a decodable JWT/i)).toBeInTheDocument();
    expect(screen.getByText(/An opaque access token is normal/i)).toBeInTheDocument();
  });

  it('names the JWE case for a five-segment token', () => {
    render(<JwtInspector token="a.b.c.d.e" />);
    expect(screen.getByText(/JWE/)).toBeInTheDocument();
  });
});

describe('hostile input (regression)', () => {
  it('renders a token with an absurd exp instead of crashing the panel', async () => {
    const { token } = await signed({ sub: 'a', exp: 99_999_999_999_999 });
    // Before the readTimeClaim guard this threw a RangeError during render.
    expect(() => render(<JwtInspector token={token} defaultOpen />)).not.toThrow();
    // `ES256` appears twice with the claim table open — the header badge and the `alg` claim row — so
    // assert on something unambiguous.
    expect(screen.getAllByText('ES256').length).toBeGreaterThan(0);
    // No countdown is shown, because the value cannot be a time — but the raw claim still is.
    expect(screen.queryByText(/expires in/i)).toBeNull();
    expect(screen.getByText('99999999999999')).toBeInTheDocument();
  });
});
