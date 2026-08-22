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
  it('clears every catalogued key — the defect was clearing three of thirteen', () => {
    for (const key of Object.values(SESSION_KEYS)) sessionStorage.setItem(key, 'x');
    resetSession();
    for (const key of Object.values(SESSION_KEYS)) {
      expect(sessionStorage.getItem(key), key).toBeNull();
    }
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
