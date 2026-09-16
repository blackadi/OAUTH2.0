import crypto from "crypto";

/**
 * RFC 4226 (HOTP) / RFC 6238 (TOTP), hand-rolled against Node's built-in `crypto` — no third-party
 * dependency. This sandbox's network firewall does not allow reaching `registry.npmjs.org` (confirmed:
 * `npm install otplib` fails with `ENOTFOUND`, not a permission prompt), so a library was not an option
 * for this change; the algorithm is small enough that hand-rolling it is not a burden, provided it is
 * checked against the specifications' own test vectors rather than trusted on sight — see `totp.test.ts`,
 * which pins every function here against RFC 4648 §10 (base32) and RFC 6238 Appendix B (HOTP/TOTP,
 * SHA-1, truncated from the RFC's 8-digit vectors to the 6 digits this module actually emits — valid
 * because 10^6 divides 10^8, so `x mod 10^6` is exactly the last 6 digits of `x mod 10^8`).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
/** RFC 6238 §5.2's own tolerance recommendation: accept one step of clock drift either side. */
const TOTP_WINDOW = 1;

/** RFC 4648 §6. Ignores `=` padding and whitespace on decode; case-insensitive. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]+$/g, "").toUpperCase().replace(/\s+/g, "");
  let bits = "";
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** RFC 4648 §6, padded to a multiple of 8 characters with `=`. */
export function base32Encode(buf: Buffer): string {
  let bits = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  while (out.length % 8 !== 0) out += "=";
  return out;
}

/** RFC 4226 §5.3. `counter` is the 8-byte big-endian moving factor. */
function hotp(secret: Buffer, counter: number, digits: number): string {
  const counterBuf = Buffer.alloc(8);
  // `counter` never exceeds Number.MAX_SAFE_INTEGER here (it is a Unix-time-derived step count), so
  // splitting into two 32-bit halves is exact.
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter % 0x100000000, 4);

  const hmac = crypto.createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binCode % 10 ** digits).padStart(digits, "0");
}

/** RFC 6238 §4.2. `T = floor((currentTime - T0) / X)`, with `T0 = 0` and `X = 30s` (this module's fixed step). */
function totpAt(secret: Buffer, timeSeconds: number): string {
  const counter = Math.floor(timeSeconds / TOTP_STEP_SECONDS);
  return hotp(secret, counter, TOTP_DIGITS);
}

/**
 * Constant-time comparison of two equal-shaped, equal-length OTP strings — `crypto.timingSafeEqual`
 * throws on a length mismatch, so that case is handled first rather than passed through.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * The current TOTP code for a secret — the generation half `verifyTotp` doesn't need at runtime (a
 * client's authenticator app generates it), but tests and the E2E suite do, to submit a real code
 * without duplicating this module's math. `now` is injectable for testing; defaults to the real clock.
 */
export function currentTotp(base32Secret: string, now: number = Math.floor(Date.now() / 1000)): string {
  return totpAt(base32Decode(base32Secret), now);
}

/**
 * Verify a submitted code against a base32 TOTP secret, tolerating `TOTP_WINDOW` steps of clock drift
 * either side (RFC 6238 §5.2). `now` is injectable for testing; defaults to the real clock.
 */
export function verifyTotp(
  code: string,
  base32Secret: string,
  now: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = base32Decode(base32Secret);
  for (let step = -TOTP_WINDOW; step <= TOTP_WINDOW; step++) {
    const candidateTime = now + step * TOTP_STEP_SECONDS;
    // RFC 4226's counter is an 8-byte UNSIGNED value (Unix time never goes negative in practice); a
    // window candidate near the epoch could otherwise compute a negative counter and throw inside
    // `writeUInt32BE` rather than simply failing to match. Skip it — negative time is never valid input,
    // not a match to search harder for.
    if (candidateTime < 0) continue;
    const candidate = totpAt(secret, candidateTime);
    if (safeEqual(candidate, code)) return true;
  }
  return false;
}

/**
 * `otpauth://` URI (the de facto format authenticator apps import), for display on the OTP page so a
 * learner can scan/paste it rather than typing the raw secret. RFC 6238 does not itself define this URI
 * scheme — it comes from the Google Authenticator "Key Uri Format" convention, which is what every
 * authenticator app actually implements.
 */
export function otpAuthUri(base32Secret: string, issuer: string, account: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: base32Secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
