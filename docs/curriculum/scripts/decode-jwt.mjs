#!/usr/bin/env node
// decode-jwt.mjs — a local, offline JWT/JWS decoder for the curriculum labs.
//
// WHY THIS EXISTS: the labs forbid pasting tokens into online decoders (you would
// be handing a live credential to a third party). This script does the same job
// locally, using only Node's built-in crypto — no dependencies, no network.
//
// WHAT IT DOES NOT DO: it does NOT verify the signature. It decodes and displays.
// Verifying a real token is the authorization server's job (Authlete, here). A
// decoder that "looks fine" tells you nothing about whether a token is trustworthy —
// that distinction is a Module 00 learning objective, so this tool stays honest
// about it and prints a loud reminder.
//
// USAGE:
//   node decode-jwt.mjs <token>
//   echo "<token>" | node decode-jwt.mjs
//   node decode-jwt.mjs --ath <access_token>   # also print the RFC 9449 `ath` value
//
// The `--ath` flag computes base64url(SHA-256(token)) — the value a DPoP proof must
// carry in its `ath` claim when the proof is bound to that access token (RFC 9449
// §4.3). Handy for the Module 05 DPoP labs.

import { createHash } from 'node:crypto';

function b64urlToBuf(s) {
  // JWT segments are base64url with no padding. Restore standard base64 first.
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Buffer.from(b64, 'base64');
}

function tryJson(buf) {
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return null; // not JSON (e.g. an encrypted JWE part, or binary) — return raw
  }
}

const EPOCH_CLAIMS = ['exp', 'iat', 'nbf', 'auth_time', 'updated_at'];

function annotateTimes(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const now = Math.floor(Date.now() / 1000);
  const lines = [];
  for (const c of EPOCH_CLAIMS) {
    if (typeof payload[c] === 'number') {
      const when = new Date(payload[c] * 1000).toISOString();
      let rel = '';
      if (c === 'exp') rel = payload[c] < now ? '  ← EXPIRED' : `  (in ${payload[c] - now}s)`;
      if (c === 'nbf' && payload[c] > now) rel = '  ← NOT YET VALID';
      lines.push(`  ${c.padEnd(10)} = ${payload[c]}  →  ${when}${rel}`);
    }
  }
  return lines;
}

function readTokenFromArgvOrStdin() {
  const args = process.argv.slice(2).filter((a) => a !== '--ath');
  if (args[0]) return args[0].trim();
  // fall back to stdin
  const data = [];
  process.stdin.setEncoding('utf8');
  return new Promise((resolve) => {
    process.stdin.on('data', (d) => data.push(d));
    process.stdin.on('end', () => resolve(data.join('').trim()));
    // If nothing is piped, end quickly with empty string.
    setTimeout(() => resolve(data.join('').trim()), 50);
  });
}

const wantAth = process.argv.includes('--ath');
const token = await readTokenFromArgvOrStdin();

if (!token) {
  console.error('Usage: node decode-jwt.mjs <token>   (or pipe the token on stdin)');
  process.exit(2);
}

const parts = token.split('.');
if (parts.length !== 3 && parts.length !== 5) {
  console.error(`Not a JWS (3 parts) or JWE (5 parts): got ${parts.length} segment(s).`);
  console.error('If this is an opaque/reference access token, it has no readable structure —');
  console.error('introspect it instead (see Module 04).');
  process.exit(1);
}

console.log(parts.length === 5 ? '=== JWE (encrypted — payload is not readable without the key) ===\n'
                               : '=== JWS / JWT ===\n');

// Header (segment 0) is always base64url JSON for both JWS and JWE.
const header = tryJson(b64urlToBuf(parts[0]));
console.log('HEADER:');
console.log(JSON.stringify(header, null, 2));
console.log();

if (parts.length === 3) {
  const payload = tryJson(b64urlToBuf(parts[1]));
  console.log('PAYLOAD:');
  console.log(payload ? JSON.stringify(payload, null, 2) : '(payload is not JSON — raw base64url shown)');
  const timeLines = annotateTimes(payload);
  if (timeLines.length) {
    console.log('\nTIME CLAIMS (decoded):');
    console.log(timeLines.join('\n'));
  }
  console.log(`\nSIGNATURE: ${parts[2].length} base64url chars (NOT verified by this tool).`);
} else {
  console.log('This is an encrypted JWE. Header shown above; the ciphertext cannot be read here.');
}

if (wantAth) {
  // `update(token)` encodes the string as utf8, and RFC 9449 §4.3 asks for the ASCII bytes.
  // Equivalent here: an access token is base64url or a JWS, so every character is ASCII, and
  // utf8 encodes ASCII byte-for-byte. Not equivalent in general — do not copy this to a hash
  // over attacker-controlled text, where a non-ASCII character makes the two encodings differ.
  const ath = createHash('sha256').update(token).digest('base64url');
  console.log(`\nath (RFC 9449 §4.3) = base64url(SHA-256(token)) = ${ath}`);
}

console.log('\n⚠  This tool DECODES only. It does not verify the signature, issuer, audience,');
console.log('   or expiry. A decodable token is not a trustworthy token. (Module 00)');
