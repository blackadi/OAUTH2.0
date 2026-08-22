/**
 * One line on what each JWT claim means, so a decoded token reads as something other than JSON.
 *
 * **Citations verified against the primary sources on 2026-08-21**, per `CLAUDE.md`. Two distinctions
 * this table is careful about, because they are where readers go wrong:
 *
 * - **The seven RFC 7519 §4.1 claims are all OPTIONAL *in that document*.** They become required by
 *   whatever profile uses them — OIDC Core §2 makes `iss`, `sub`, `aud`, `exp` and `iat` REQUIRED in an
 *   ID token, and RFC 9068 §2.2 makes a different set required in a JWT access token. "Required"
 *   without saying *by what* is the mistake.
 * - **`auth_time` is OPTIONAL until you ask for it.** OIDC Core §2 makes it REQUIRED when `max_age` was
 *   requested or when it was asked for as an Essential Claim.
 */

export interface ClaimDoc {
  /** Human name. */
  name: string;
  /** Where it is defined. */
  spec: string;
  note: string;
}

export const CLAIM_DOCS: Record<string, ClaimDoc> = {
  // ── RFC 7519 §4.1 registered claims ─────────────────────────────────────────────────────────────
  iss: {
    name: 'Issuer',
    spec: 'RFC 7519 §4.1.1 · OIDC Core §2 (REQUIRED in an ID token)',
    note: 'Who issued this token. A client must compare it against the issuer it expects — a signature proves who signed, never who was allowed to speak.',
  },
  sub: {
    name: 'Subject',
    spec: 'RFC 7519 §4.1.2 · OIDC Core §2 (REQUIRED in an ID token)',
    note: 'Who the token is about. In an ID token it is locally unique and never reassigned; a client-credentials token has no subject at all, because there is no user.',
  },
  aud: {
    name: 'Audience',
    spec: 'RFC 7519 §4.1.3 · OIDC Core §2 (REQUIRED in an ID token)',
    note: 'Who the token is for. Reject a token whose audience is not you. This service is configured to emit a single string rather than an array — a FAPI working-group decision from Nov 2024.',
  },
  exp: {
    name: 'Expiration Time',
    spec: 'RFC 7519 §4.1.4 · OIDC Core §2 (REQUIRED in an ID token)',
    note: 'On or after this instant the token MUST NOT be accepted. Seconds since the Unix epoch.',
  },
  nbf: {
    name: 'Not Before',
    spec: 'RFC 7519 §4.1.5',
    note: 'Before this instant the token MUST NOT be accepted. FAPI 1.0 Advanced requires it on a request object, and bounds the lifetime to 60 *minutes* — not seconds.',
  },
  iat: {
    name: 'Issued At',
    spec: 'RFC 7519 §4.1.6 · OIDC Core §2 (REQUIRED in an ID token)',
    note: 'When the token was issued. Not the same as when the user authenticated — that is `auth_time`.',
  },
  jti: {
    name: 'JWT ID',
    spec: 'RFC 7519 §4.1.7 · RFC 9068 §2.2 (REQUIRED in a JWT access token)',
    note: 'A unique identifier, so a recipient can detect replay. Only useful if it is actually unique per token — never derived from the other claims.',
  },

  // ── OIDC Core §2 ID token claims ────────────────────────────────────────────────────────────────
  auth_time: {
    name: 'Authentication Time',
    spec: 'OIDC Core §2',
    note: 'When the End-User actually authenticated. OPTIONAL in general, but REQUIRED once `max_age` is requested or it is asked for as an Essential Claim — and it is what `max_age` is enforced against. A reissued ID token holds it at the *original* authentication time rather than advancing it.',
  },
  nonce: {
    name: 'Nonce',
    spec: 'OIDC Core §2, §3.1.2.1 · RFC 9449 §8 (in a DPoP proof)',
    note: 'In an ID token: the value from the authorization request, echoed back for the client to check. In a DPoP proof: the server-supplied nonce being replayed. Note this server drops `nonce` from an ID token reissued during a refresh.',
  },
  acr: {
    name: 'Authentication Context Class Reference',
    spec: 'OIDC Core §2 · RFC 9470',
    note: 'How strongly the user was authenticated. This deployment only ever satisfies `pwd`; anything else is what triggers a step-up challenge.',
  },
  amr: {
    name: 'Authentication Methods References',
    spec: 'OIDC Core §2',
    note: 'Which methods were used, as an array — a password, an OTP, a hardware key.',
  },
  azp: {
    name: 'Authorized Party',
    spec: 'OIDC Core §2',
    note: 'The party the ID token was issued to, when that differs from the sole audience.',
  },
  at_hash: {
    name: 'Access Token Hash',
    spec: 'OIDC Core §3.1.3.6, §3.2.2.10',
    note: 'Half the hash of the access token, binding the two together so a mismatched pair can be detected.',
  },
  c_hash: {
    name: 'Code Hash',
    spec: 'OIDC Core §3.3.2.11',
    note: 'Half the hash of the authorization code, binding the code to this ID token in a hybrid flow.',
  },
  s_hash: {
    name: 'State Hash',
    spec: 'FAPI 1.0 Advanced',
    note: 'Half the hash of `state`. This server does not emit it on a reissued ID token, which is worth knowing before relying on it.',
  },
  sid: {
    name: 'Session ID',
    spec: 'OIDC Back-Channel Logout 1.0',
    note: 'Names an OP session so a logout token can terminate exactly that one. This deployment issues no `sid` of its own — it declines Session Management — so a logout token carrying only `sid` is accepted and acts on nothing.',
  },
  events: {
    name: 'Events',
    spec: 'OIDC Back-Channel Logout 1.0 §2.4',
    note: 'Marks the JWT as a logout token. Its presence is one of the eleven validation steps §2.6 requires.',
  },

  // ── RFC 9068 JWT access token ───────────────────────────────────────────────────────────────────
  client_id: {
    name: 'Client ID',
    spec: 'RFC 9068 §2.2 (REQUIRED in a JWT access token)',
    note: 'Which client the token was issued to.',
  },
  scope: {
    name: 'Scope',
    spec: 'RFC 9068 §2.2.3',
    note: 'Space-delimited scopes the token actually carries — which may be narrower than what was asked for.',
  },
  cnf: {
    name: 'Confirmation',
    spec: 'RFC 9449 §6.1 (jkt) · RFC 7800',
    note: 'Proof-of-possession binding. `cnf.jkt` is the SHA-256 thumbprint of the DPoP key: this token is only usable by whoever holds that private key. **This, not the scheme the caller chose, is what makes a token sender-constrained** — a `DPoP` scheme on a token with no `cnf` is decorative.',
  },

  // ── RFC 9449 DPoP proof ─────────────────────────────────────────────────────────────────────────
  htm: {
    name: 'HTTP Method',
    spec: 'RFC 9449 §4.2',
    note: 'The method of the request this proof was made for.',
  },
  htu: {
    name: 'HTTP URI',
    spec: 'RFC 9449 §4.2',
    note: 'The target URI **without query or fragment**. Including the query string is the classic mistake: the proof then fails on any request that has one.',
  },
  ath: {
    name: 'Access Token Hash',
    spec: 'RFC 9449 §7.1',
    note: 'base64url SHA-256 of the access token this proof accompanies. REQUIRED when a proof is used with an access token — and it is `ath`, not `sub`.',
  },
};

/** Claim names that carry a NumericDate, so they can be rendered as a time rather than an integer. */
export const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time', 'updated_at']);
