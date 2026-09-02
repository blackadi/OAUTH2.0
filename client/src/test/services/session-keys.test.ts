import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SESSION_KEYS,
  readKey,
  writeKey,
  removeKey,
  readJsonKey,
  clearDpopKeys,
  resetSession,
} from '@/services/session-keys';

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('the key inventory', () => {
  it('has no duplicate raw values, which would make two names one slot', () => {
    const values = Object.values(SESSION_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('includes the signing key that used to be unclearable', () => {
    expect(Object.values(SESSION_KEYS)).toContain('fapi_signing_private_key');
    expect(Object.values(SESSION_KEYS)).toContain('fapi_signing_pub_jwk');
  });
});

describe('resetSession', () => {
  it('clears every catalogued credential — the defect was clearing three of thirteen', () => {
    for (const key of Object.values(SESSION_KEYS)) sessionStorage.setItem(key, 'x');
    resetSession();
    for (const key of Object.values(SESSION_KEYS)) {
      if (key === SESSION_KEYS.traceHistory) continue;
      expect(sessionStorage.getItem(key), key).toBeNull();
    }
  });

  /**
   * **The one documented exception, pinned so it cannot drift in either direction.**
   *
   * `resetSession` is what `TokenContext.clearTokens` calls, which is what the vault's "Clear session"
   * button calls. Sweeping the trace along with the credentials would delete the request history as a
   * side effect of clearing tokens — the evidence of the flow you just ran, removed by the button you
   * press to run another one, and absent from that dialog's list of what it removes. The trace is
   * evidence, not state: nothing about the next request depends on it, and it has its own clear.
   */
  it('leaves the request trace, which is evidence rather than credential state', () => {
    writeKey(SESSION_KEYS.traceHistory, '{"entries":[],"counter":0}');
    writeKey(SESSION_KEYS.tokenResponse, '{"access_token":"at"}');
    resetSession();
    expect(readKey(SESSION_KEYS.tokenResponse)).toBeNull();
    expect(
      readKey(SESSION_KEYS.traceHistory),
      'clearing tokens must not silently discard the request history',
    ).not.toBeNull();
  });

  it('clears the private_key_jwt signing key specifically', () => {
    // The sticky one: while it survived, every later code exchange silently switched to
    // `private_key_jwt`, which a client_secret_basic client answers with a 401.
    writeKey(SESSION_KEYS.fapiSigningKey, '{"kty":"EC"}');
    resetSession();
    expect(readKey(SESSION_KEYS.fapiSigningKey)).toBeNull();
  });

  it('leaves unrelated keys alone', () => {
    sessionStorage.setItem('something_else', 'keep me');
    resetSession();
    expect(sessionStorage.getItem('something_else')).toBe('keep me');
  });
});

describe('clearDpopKeys', () => {
  it('drops the key pair and the cached nonce but not the token', () => {
    writeKey(SESSION_KEYS.dpopPrivateKey, 'priv');
    writeKey(SESSION_KEYS.dpopPublicKey, 'pub');
    writeKey(SESSION_KEYS.dpopKid, 'kid');
    writeKey(SESSION_KEYS.dpopNonce, 'nonce');
    writeKey(SESSION_KEYS.tokenResponse, '{"access_token":"at"}');

    clearDpopKeys();

    expect(readKey(SESSION_KEYS.dpopPrivateKey)).toBeNull();
    expect(readKey(SESSION_KEYS.dpopNonce)).toBeNull();
    // Turning DPoP off should not discard the token you already obtained with it.
    expect(readKey(SESSION_KEYS.tokenResponse)).toBe('{"access_token":"at"}');
  });
});

describe('accessors', () => {
  it('round-trips a value', () => {
    writeKey(SESSION_KEYS.oauthState, 's1');
    expect(readKey(SESSION_KEYS.oauthState)).toBe('s1');
    removeKey(SESSION_KEYS.oauthState);
    expect(readKey(SESSION_KEYS.oauthState)).toBeNull();
  });

  it('parses JSON and returns null on anything malformed rather than throwing', () => {
    writeKey(SESSION_KEYS.dpopPrivateKey, '{"kty":"EC","crv":"P-256"}');
    expect(readJsonKey<{ kty: string }>(SESSION_KEYS.dpopPrivateKey)?.kty).toBe('EC');

    writeKey(SESSION_KEYS.dpopPrivateKey, 'not json');
    expect(() => readJsonKey(SESSION_KEYS.dpopPrivateKey)).not.toThrow();
    expect(readJsonKey(SESSION_KEYS.dpopPrivateKey)).toBeNull();
  });

  it('survives a storage that throws, as a sandboxed frame or blocked site data does', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => writeKey(SESSION_KEYS.oauthState, 'x')).not.toThrow();
    expect(readKey(SESSION_KEYS.oauthState)).toBeNull();
    expect(readJsonKey(SESSION_KEYS.oauthState)).toBeNull();
  });
});
