import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseRunFile,
  serializeRunFile,
  toRunFile,
  RunFileError,
  RUN_FILE_FORMAT,
  RUN_FILE_VERSION,
} from '@/services/run-file';
import {
  clearTraces,
  getTraces,
  importTraces,
  recordTrace,
  type TraceEntry,
  type TraceInput,
} from '@/services/trace-store';

/**
 * Export a run, and read one back (P3-4).
 *
 * A Markdown export already existed and **nothing could read it**, so a run was shareable only as prose:
 * the recipient could look at the exchange but could not load it and click through it. Both artefacts now
 * exist with distinct jobs — Markdown to read, JSON to load — and `services/run-file.ts` says why parsing
 * the Markdown back would have been the wrong repair.
 *
 * Two properties matter more than the round-trip itself, and both are asserted below:
 *
 * 1. **Credentials do not travel.** An exported run leaves the tab, and there is no per-entry reveal
 *    decision left to honour once it has. The panel's masking is per-view and reversible; this must not
 *    be.
 * 2. **An imported entry is marked, permanently.** A trace panel showing somebody else's requests as
 *    though they were yours is the one failure of this feature that costs a real afternoon.
 */

const FIXED = new Date('2026-08-23T12:00:00.000Z');

/**
 * The fake credential, **encoded at runtime rather than committed as a literal.**
 *
 * It was a hardcoded `Authorization: 'Basic <base64>'` header — the exact shape a secret scanner is
 * built to catch, and **GitGuardian failed the build on it** (PR #77). The payload was always fake,
 * but the objection is not about this payload: a committed
 * `Basic <base64>` literal is indistinguishable from a real leak at a glance, which is why the scanner is
 * right and why `AGENTS.md` says to redact credentials in examples as well as in logs.
 *
 * Composing it here costs nothing and asserts *more* clearly. The strings are unmistakably fake, the
 * client id is not this deployment's real public one, and the assertions below still demand that the
 * encoded form never reaches the exported file — which is the whole property under test.
 */
const FAKE_CLIENT = 'not-a-real-client';
const FAKE_SECRET = 'not-a-real-secret';
const FAKE_BASIC_ENCODED = btoa(`${FAKE_CLIENT}:${FAKE_SECRET}`);

function input(over: Partial<TraceInput> = {}): TraceInput {
  return {
    startedAt: 1_770_000_000_000,
    durationMs: 42,
    method: 'POST',
    url: 'http://localhost:3000/api/token',
    label: 'token exchange',
    requestHeaders: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${FAKE_BASIC_ENCODED}`,
    },
    requestBody: `grant_type=authorization_code&code=abc&client_secret=${FAKE_SECRET}`,
    status: 200,
    statusText: 'OK',
    responseHeaders: { 'DPoP-Nonce': 'nonce-1', 'WWW-Authenticate': 'DPoP error="use_dpop_nonce"' },
    responseBody: { access_token: 'at-1', token_type: 'DPoP' },
    ok: true,
    ...over,
  };
}

/** The same shape with an id, which is what a *file* carries and what `TraceEntry` requires. */
function entry(over: Partial<TraceEntry> = {}): TraceEntry {
  return { id: 't1', ...input(), ...over };
}

beforeEach(() => clearTraces());

describe('what an exported run carries', () => {
  it('names its own format and version, so a reader can refuse a file it does not understand', () => {
    const file = toRunFile([entry()], FIXED);
    expect(file.format).toBe(RUN_FILE_FORMAT);
    expect(file.version).toBe(RUN_FILE_VERSION);
    expect(file.exportedAt).toBe('2026-08-23T12:00:00.000Z');
  });

  /**
   * The reason redaction is not optional here, unlike in the panel: the file travels. `Authorization`
   * carries `Basic <base64>`, which is a client secret in transit and reversible by anyone.
   */
  it('masks the credential headers and the credential form fields', () => {
    const text = serializeRunFile([entry()], FIXED);

    expect(text).not.toContain(FAKE_BASIC_ENCODED);
    expect(
      text,
      'a client secret in the body travels just as far as one in a header',
    ).not.toContain(FAKE_SECRET);
    // The header is still *present* — knowing that client authentication was attempted is the point.
    expect(toRunFile([entry()], FIXED).entries[0].requestHeaders).toHaveProperty('Authorization');
  });

  /**
   * The other half of the redaction decision, and it is deliberate rather than an oversight:
   * `WWW-Authenticate` and `DPoP-Nonce` are the entire step-up and DPoP challenge mechanism. Stripping
   * them would remove the thing a recipient most needs to see, and neither is a secret of the sender.
   */
  it('keeps the response headers that carry the protocol', () => {
    const text = serializeRunFile([entry()], FIXED);
    expect(text).toContain('DPoP-Nonce');
    expect(text).toContain('use_dpop_nonce');
  });
});

describe('the round trip', () => {
  it('reads back every request it wrote, in order', () => {
    const text = serializeRunFile(
      [entry({ id: 't2', url: 'http://localhost:3000/api/par' }), entry({ id: 't1' })],
      FIXED,
    );

    const { entries, version } = parseRunFile(text);
    expect(version).toBe(RUN_FILE_VERSION);
    expect(entries.map((e) => e.url)).toEqual([
      'http://localhost:3000/api/par',
      'http://localhost:3000/api/token',
    ]);
    expect(entries[0].status).toBe(200);
    expect(entries[0].responseBody).toEqual({ access_token: 'at-1', token_type: 'DPoP' });
  });

  /**
   * A front-channel hop is the row a lossy format loses first — it has no status, no duration and no
   * headers, so a reader that required those would drop precisely the two most important requests in
   * OAuth. `SequenceView` draws its arrows from `direction`.
   */
  it('preserves a front-channel navigation, including its direction', () => {
    const nav = entry({
      method: 'GET',
      url: 'http://localhost:3000/api/authorization?client_id=x',
      status: 0,
      statusText: 'front-channel navigation',
      requestHeaders: {},
      requestBody: undefined,
      responseHeaders: {},
      responseBody: 'Front-channel hop',
      navigation: true,
      direction: 'outbound',
    });

    const [read] = parseRunFile(serializeRunFile([nav], FIXED)).entries;
    expect(read.navigation).toBe(true);
    expect(read.direction).toBe('outbound');
  });

  /**
   * Loose, never strict — `schemas.ts`'s first rule, one layer over. A file written by a newer build
   * carries members this reader has never heard of, and rejecting it for that would make a
   * forward-compatible format backward-breaking.
   */
  it('accepts a file carrying members this build does not know about', () => {
    const forward = JSON.stringify({
      format: RUN_FILE_FORMAT,
      version: 1,
      exportedAt: FIXED.toISOString(),
      somethingAddedLater: { deep: true },
      entries: [{ ...entry(), retriedAfter: 3 }],
    });

    expect(() => parseRunFile(forward)).not.toThrow();
    expect(parseRunFile(forward).entries).toHaveLength(1);
  });
});

describe('what it refuses, and what it says', () => {
  /** Bad JSON before wrong document before wrong version before wrong shape — a HAR export renamed to .json
   * must not be told that "entries is missing", which sends the reader looking in the wrong place. */
  it('rejects a file that is not JSON', () => {
    expect(() => parseRunFile('<html>nope</html>')).toThrow(RunFileError);
    expect(() => parseRunFile('<html>nope</html>')).toThrow(/not JSON/i);
  });

  it('rejects a JSON file that is some other document', () => {
    const har = JSON.stringify({ log: { version: '1.2', entries: [] } });
    expect(() => parseRunFile(har)).toThrow(/not a saved run/i);
  });

  it('rejects a run from a newer build, and names both versions', () => {
    const future = JSON.stringify({ format: RUN_FILE_FORMAT, version: 99, entries: [] });
    expect(() => parseRunFile(future)).toThrow(/newer version/i);
    expect(() => parseRunFile(future)).toThrow(/99/);
  });

  /** An *older* version is readable, which is the whole point of having one. */
  it('accepts a run from an older build', () => {
    const old = JSON.stringify({ format: RUN_FILE_FORMAT, version: 0, entries: [entry()] });
    expect(parseRunFile(old).entries).toHaveLength(1);
  });

  it('rejects a run whose entries are the wrong shape, rather than importing half of one', () => {
    const bad = JSON.stringify({
      format: RUN_FILE_FORMAT,
      version: 1,
      entries: [{ url: 'http://x', method: 'GET' }],
    });
    expect(() => parseRunFile(bad)).toThrow(/malformed/i);
  });
});

describe('an imported run is never mistaken for live traffic', () => {
  it('marks every entry as imported on the way in', () => {
    const { entries } = parseRunFile(serializeRunFile([entry(), entry({ id: 't2' })], FIXED));
    expect(entries.every((e) => e.imported)).toBe(true);
  });

  /**
   * Even if the file claims otherwise. A hand-edited `"imported": false` must not buy an entry a
   * disguise — which is why `importTraces` sets the flag itself rather than trusting what it was handed.
   */
  it('marks them even when the file says they are not imported', () => {
    const lying = JSON.stringify({
      format: RUN_FILE_FORMAT,
      version: 1,
      entries: [{ ...entry(), imported: false }],
    });

    importTraces(parseRunFile(lying).entries);
    expect(getTraces()[0].imported).toBe(true);
  });

  /**
   * **Replace rather than merge.** Interleaving somebody else's requests with your own by `startedAt`
   * produces a timeline that never happened — two clocks, two machines, one axis.
   */
  it('replaces the current trace rather than merging into it', () => {
    recordTrace(input({ url: 'http://localhost:3000/api/mine' }));
    expect(getTraces()).toHaveLength(1);

    importTraces(parseRunFile(serializeRunFile([entry(), entry({ id: 't2' })], FIXED)).entries);

    const after = getTraces();
    expect(after).toHaveLength(2);
    expect(after.some((e) => e.url.endsWith('/api/mine'))).toBe(false);
  });

  /**
   * Ids are re-minted, not carried. Keeping the file's would let an imported entry collide with a live
   * request recorded after the import — and `TracePanel` keys its rows by id.
   */
  it('re-mints ids so an import cannot collide with a later live request', () => {
    importTraces(parseRunFile(serializeRunFile([entry({ id: 't99' })], FIXED)).entries);
    expect(getTraces()[0].id).toBe('t1');

    const live = recordTrace(input({ url: 'http://localhost:3000/api/next' }));
    expect(live.id).not.toBe('t1');
    expect(new Set(getTraces().map((e) => e.id)).size).toBe(getTraces().length);
  });

  it('leaves a live entry unmarked, so the flag means something', () => {
    recordTrace(input());
    expect(getTraces()[0].imported).toBeUndefined();
  });
});
