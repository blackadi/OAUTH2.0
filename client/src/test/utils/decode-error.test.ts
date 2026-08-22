import { describe, it, expect } from 'vitest';
import { decodeError, statusHint } from '@/utils/decode-error';
import { AUTHLETE_NOTES, OAUTH_ERRORS } from '@/data/errorDocs';
import { AUTHLETE_CODES } from '@/data/authlete-codes.generated';

describe('extracting codes from what servers actually send', () => {
  it('reads a JSON error body', () => {
    const d = decodeError('{"error":"invalid_grant","error_description":"code expired"}');
    expect(d.oauthError).toBe('invalid_grant');
    expect(d.description).toBe('code expired');
    expect(d.oauthDoc?.cause).toMatch(/invalid, expired, revoked/);
  });

  it('reads a WWW-Authenticate challenge, where RFC 6750 §3 puts the code', () => {
    const d = decodeError(
      '401 Unauthorized · Bearer error="invalid_token", error_description="[A088302] The access token does not exist."',
    );
    expect(d.oauthError).toBe('invalid_token');
    expect(d.authleteCode).toBe('A088302');
  });

  it('reads an error redirect query string', () => {
    const d = decodeError(
      '302 → https://app.example/cb?error=invalid_target&error_description=%5BA251307%5D',
    );
    expect(d.oauthError).toBe('invalid_target');
  });

  it('finds an Authlete code with or without brackets', () => {
    expect(decodeError('[A157357] nope').authleteCode).toBe('A157357');
    expect(decodeError('resultCode: A157357').authleteCode).toBe('A157357');
  });

  it('carries the status through', () => {
    expect(decodeError({ raw: 'boom', status: 429 }).status).toBe(429);
  });
});

describe('what it refuses to do', () => {
  it('does not invent an explanation for an unknown Authlete code', () => {
    const d = decodeError('[A999999] something new');
    expect(d.authleteCode).toBe('A999999');
    expect(d.authleteNote).toBeUndefined();
    expect(d.authleteVendor).toBeUndefined();
    expect(d.recognised).toBe(false);
  });

  it('does not invent an explanation for an unknown OAuth error code', () => {
    const d = decodeError('{"error":"totally_made_up"}');
    expect(d.oauthError).toBe('totally_made_up');
    expect(d.oauthDoc).toBeUndefined();
    expect(d.recognised).toBe(false);
  });

  it('reports nothing recognised for text with no codes at all', () => {
    const d = decodeError('Something went wrong');
    expect(d.recognised).toBe(false);
    expect(d.oauthError).toBeUndefined();
    expect(d.authleteCode).toBeUndefined();
  });
});

describe('the repo-verified notes', () => {
  it('explains the wrong-channel 401, which is the most confusing failure on this server', () => {
    const d = decodeError(
      '401 · [A157357] The client identifier is not found at the expected location.',
    );
    expect(d.authleteNote?.verifiedHere).toBe(true);
    expect(d.authleteNote?.cause).toMatch(/channel/);
    expect(d.authleteNote?.fix).toMatch(/client_secret_basic/);
  });

  it('distinguishes the two DPoP nonce codes as one condition', () => {
    expect(decodeError('[A254307]').authleteNote?.cause).toMatch(/token endpoint/);
    expect(decodeError('[A350308]').authleteNote?.cause).toMatch(/PAR/);
    // Both point the reader at the error code rather than the vendor code.
    expect(decodeError('[A254307]').authleteNote?.fix).toMatch(/use_dpop_nonce/);
  });

  it('marks every note as verified against this deployment', () => {
    for (const [code, note] of Object.entries(AUTHLETE_NOTES)) {
      expect(note.verifiedHere, code).toBe(true);
      expect(note.spec, code).toBeTruthy();
      expect(note.cause.length, code).toBeGreaterThan(20);
    }
  });

  it('covers codes the vendor document does not — which is the whole point of the layer', () => {
    // Measured, not assumed: the two sets are **disjoint**. Authlete's OpenAPI document carries 38
    // result-code examples, almost all of them generic or success cases, and *none* of the 26 codes
    // this repo established by probing appears in it. So a decoder built from the vendor document
    // alone would explain nothing a developer actually hits on this deployment.
    const vendorCodes = new Set(Object.keys(AUTHLETE_CODES));
    const noteCodes = Object.keys(AUTHLETE_NOTES);
    expect(noteCodes.length).toBeGreaterThan(20);
    expect(noteCodes.filter((c) => vendorCodes.has(c))).toEqual([]);

    // And a note alone is enough to explain an error.
    const d = decodeError('[A088302] The access token does not exist.');
    expect(d.authleteVendor).toBeUndefined();
    expect(d.authleteNote?.cause).toBeTruthy();
    expect(d.recognised).toBe(true);
  });
});

describe('the generated vendor table', () => {
  it('holds only the vendor codes, keyed correctly', () => {
    for (const [code, entry] of Object.entries(AUTHLETE_CODES)) {
      expect(code, code).toMatch(/^A\d{6}$/);
      expect(entry.message.length, code).toBeGreaterThan(0);
      // The redundant `[Annnnnn]` prefix is stripped at generation time.
      expect(entry.message, code).not.toMatch(/^\[A\d{6}\]/);
      expect(entry.status, code).toBeGreaterThanOrEqual(200);
    }
  });

  it('reports boilerplate codes as belonging to many operations, not to one', () => {
    // A001202 is the "Authorization header is missing" example on 83 operations. Attributing it to
    // whichever sorts first would state something false.
    const entry = AUTHLETE_CODES.A001202;
    expect(entry.endpoint).toBeNull();
    expect(entry.endpointCount).toBeGreaterThan(3);
  });
});

describe('the specification table', () => {
  it('covers the codes a user of this server will actually hit', () => {
    for (const code of [
      'invalid_request',
      'invalid_client',
      'invalid_grant',
      'invalid_scope',
      'invalid_token',
      'insufficient_scope',
      'use_dpop_nonce',
      'invalid_dpop_proof',
      'insufficient_user_authentication',
      'invalid_target',
      'invalid_authorization_details',
      'authorization_pending',
      'slow_down',
      'expired_token',
      'access_denied',
    ]) {
      expect(OAUTH_ERRORS[code], code).toBeDefined();
      expect(OAUTH_ERRORS[code].spec, code).toMatch(/RFC|CIBA/);
    }
  });

  it('treats a poll-in-progress as not-an-error, since that is what it is', () => {
    expect(OAUTH_ERRORS.authorization_pending.cause).toMatch(/Not an error/);
  });
});

describe('statusHint', () => {
  it('names the rate limit, the failure most easily mistaken for bad credentials', () => {
    expect(statusHint(429)).toMatch(/Rate limited/);
    expect(statusHint(429)).toMatch(/15 token calls/);
  });

  it('separates 401 from 403 by what was accepted', () => {
    expect(statusHint(401)).toMatch(/credentials/);
    expect(statusHint(403)).toMatch(/identity was accepted/);
  });

  it('describes what a 404 means here, now that unmatched /api paths are terminated', () => {
    // The hint used to say an unknown /api path answers 200 with HTML. That was true until the server
    // grew a JSON terminator (F-27); leaving the old wording would have made the decoder authoritative
    // and wrong, which is the failure the whole error table exists to avoid.
    expect(statusHint(404)).toMatch(/not_found/);
    expect(statusHint(404)).not.toMatch(/answers 200 with the dashboard HTML/);
  });

  it('says nothing when there is nothing to say', () => {
    expect(statusHint(200)).toBeUndefined();
    expect(statusHint(undefined)).toBeUndefined();
  });
});

describe('error_uri', () => {
  it('extracts the vendor documentation link this server actually sends', () => {
    // Captured live from /api/authorization with no response_type.
    const raw =
      '{"error":"invalid_request","error_description":"[A009301] The authorization request does not contain \'response_type\' parameter.","error_uri":"https://docs.authlete.com/#A009301"}';
    const d = decodeError(raw);
    expect(d.errorUri).toBe('https://docs.authlete.com/#A009301');
    expect(d.authleteCode).toBe('A009301');
    expect(d.authleteNote?.cause).toMatch(/response mode/i);
  });

  it('ignores a non-http scheme rather than putting it in an href', () => {
    expect(decodeError('{"error_uri":"javascript:alert(1)"}').errorUri).toBeUndefined();
  });
});

describe('code extraction requires a standalone code (regression)', () => {
  /**
   * The first version of AUTHLETE_CODE_RE had no boundaries, so any six digits after a capital A
   * inside an opaque token, a JWT segment or a hash were extracted as a result code. That is the exact
   * failure this decoder exists to prevent: a fabricated code colliding with a real entry would be
   * given a confident and wrong explanation, indistinguishable from a correct one.
   */
  it('ignores a code-shaped substring inside an opaque token', () => {
    expect(
      decodeError('{"error":"invalid_token","error_description":"token xxA1234567yy rejected"}')
        .authleteCode,
    ).toBeUndefined();
  });

  it('ignores a code-shaped substring inside a JWT segment', () => {
    expect(
      decodeError('failed for eyJhbGciOiJIUzI1NiA123456QUJD.payload.sig').authleteCode,
    ).toBeUndefined();
  });

  it('does not truncate a seven-digit code into a six-digit one', () => {
    expect(decodeError('[A1234567]').authleteCode).toBeUndefined();
  });

  it('still finds a real code in every shape servers send it', () => {
    expect(decodeError('[A157357] nope').authleteCode).toBe('A157357');
    expect(decodeError('A157357 at the very start').authleteCode).toBe('A157357');
    expect(decodeError('{"resultCode":"A157357"}').authleteCode).toBe('A157357');
    expect(decodeError('401 · [A157357] wrong channel.').authleteCode).toBe('A157357');
    expect(decodeError('...error_description="[A009301] no response_type"').authleteCode).toBe(
      'A009301',
    );
  });
});
