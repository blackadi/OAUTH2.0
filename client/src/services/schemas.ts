import * as z from 'zod/mini';

/**
 * What this app expects an authorization server to send back, written down once.
 *
 * **The defect these exist for.** T1-11 changed `POST /api/par` to answer RFC 9126 §2.2's body —
 * `request_uri`, snake_case — where it had been forwarding Authlete's camelCase envelope. `RarSection`
 * went on reading `requestUri`, got `undefined`, and its "push and redirect" button **silently did
 * nothing at all**: no redirect, no error, and because the response object itself was truthy the error
 * branch never ran either. `FapiSection` had the identical bug by the identical route — a local
 * `as { requestUri?: string }` cast that bypassed the shared type.
 *
 * The driven section tests catch that per section. A schema catches it **once, for every caller**, and
 * catches the other direction too: the day the server's shape changes, the request that used to work
 * fails loudly at the boundary instead of leaving one field quietly undefined three layers up.
 *
 * ## Three rules these follow
 *
 * 1. **Loose, always** — `z.looseObject`, never `z.strictObject`. An authorization server may return
 *    anything alongside the members it must; RFC 6749 §5.1 says so explicitly and Authlete does it.
 *    A strict schema would reject `grant_id`, `authorization_details` and every vendor field, turning a
 *    correct server into a broken one. *(`z.object` would merely strip unknown members rather than
 *    reject them, and `validate` discards the parsed value anyway, so loose-versus-object is
 *    documentation of intent; loose-versus-strict is the one that decides behaviour. Measured, after a
 *    mutation check showed a test that had been written to pin the wrong half of it.)*
 * 2. **Required means the spec says REQUIRED, or the flow cannot proceed.** Where those two differ, the
 *    comment says which one is doing the work. Nothing is marked required to be tidy.
 * 3. **Every conformance word below was read from the RFC, not from memory** (2026-08-23), per
 *    `CLAUDE.md`. Where a specification attaches no conformance word at all — RFC 9126 §2.2 is the one
 *    here — that is stated rather than papered over with a plausible-looking one.
 *
 * ## `zod/mini`, and the number that decided it
 *
 * Measured on this bundle rather than assumed:
 *
 * | | main chunk, gzip | over baseline |
 * |---|---|---|
 * | no schemas | 93.8 kB | — |
 * | `zod/mini` | 120.4 kB | +26.6 kB |
 * | `zod` | 133.7 kB | +39.9 kB |
 *
 * The reason to expect a trade-off is message quality, and there is none: for a missing member, a wrong
 * type and an unexpected member alike, the two produce **byte-identical** `issue.message` strings —
 * checked directly rather than inferred. So `mini` costs 13 kB less for nothing given up, and its only
 * real difference is a functional API (`z.optional(z.number())` rather than `z.number().optional()`).
 * If a schema below ever needs something `mini` lacks, moving that one file to full `zod` is a one-line
 * import change; do not do it for the error messages.
 *
 * ## What they are deliberately not
 *
 * Not a conformance checker. A response that violates a SHOULD, or omits a RECOMMENDED member, is
 * accepted and shown — that is the authorization server's business and often the very thing a learner
 * is here to look at. These catch the narrower thing: **a body this app cannot read**.
 */

/**
 * RFC 6749 §5.1 — the token endpoint's successful response.
 *
 * `access_token` and `token_type` are *"REQUIRED"*; `expires_in` is *"RECOMMENDED"*; `refresh_token` is
 * *"OPTIONAL"*; and `scope` is *"OPTIONAL, if identical to the scope requested by the client;
 * otherwise, REQUIRED"* — a conditional this schema cannot evaluate, since it never saw the request, so
 * it is optional here.
 *
 * `id_token` is OpenID Connect Core §3.1.3.3, not RFC 6749. `grant_id` is Grant Management for OAuth
 * 2.0 and arrives only when the request asked for one; `token.controller.ts:52` forwards it verbatim.
 */
export const tokenResponseSchema = z.looseObject({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.optional(z.number()),
  refresh_token: z.optional(z.string()),
  scope: z.optional(z.string()),
  id_token: z.optional(z.string()),
  grant_id: z.optional(z.string()),
});

/**
 * RFC 9126 §2.2 — the pushed authorization response.
 *
 * **§2.2 attaches no conformance word to either member.** It says only that they are *"included as
 * top-level members in the message body"*, so "REQUIRED" would be this repo inventing one. `request_uri`
 * is required here on the second ground instead: it is the single-use reference the authorization
 * request must carry, and without it there is no next step — which is precisely the state that made
 * `RarSection`'s button inert.
 */
export const parResponseSchema = z.looseObject({
  request_uri: z.string(),
  expires_in: z.optional(z.number()),
});

/**
 * RFC 8628 §3.2 — the device authorization response.
 *
 * *"REQUIRED"* for `device_code`, `user_code`, `verification_uri` and `expires_in`; *"OPTIONAL"* for
 * `verification_uri_complete` and `interval`. `interval` being optional is load-bearing rather than
 * incidental: `deviceFlowPollingInterval` of 0 omits it from the response entirely, and §3.5 tells a
 * client to default to 5 seconds when it is absent.
 *
 * Until T1-11 this endpoint answered Authlete's camelCase envelope — `userCode`, `deviceCode` — so a
 * body matching this schema is itself the evidence that change is still in place.
 */
export const deviceAuthorizationSchema = z.looseObject({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  expires_in: z.number(),
  verification_uri_complete: z.optional(z.string()),
  interval: z.optional(z.number()),
});

/**
 * RFC 7591 §3.2.1 — the client information response.
 *
 * Only `client_id` is *"REQUIRED"*. `client_secret` is *"OPTIONAL"*, and `client_secret_expires_at` is
 * *"REQUIRED if `client_secret` is issued"* — a conditional left unmodelled deliberately, because
 * enforcing it would reject a real Authlete response for a rule Authlete, not this app, would be
 * breaking.
 *
 * **`registration_access_token` and `registration_client_uri` are RFC 7592, not §3.2.1** — checked
 * against the primary source on 2026-08-23, having been about to be cited as 7591. They are optional
 * here for the honest reason that a plain 7591 registration need not carry them, even though
 * `DcrSection` hands them to its next three tabs when they arrive.
 */
export const dcrRegistrationSchema = z.looseObject({
  client_id: z.string(),
  client_secret: z.optional(z.string()),
  client_id_issued_at: z.optional(z.number()),
  client_secret_expires_at: z.optional(z.number()),
  registration_access_token: z.optional(z.string()),
  registration_client_uri: z.optional(z.string()),
});

/**
 * RFC 8414 §2 — authorization server metadata.
 *
 * *"REQUIRED"* for `issuer` and `response_types_supported`. `authorization_endpoint` is *"REQUIRED
 * unless no grant types are supported that use the authorization endpoint"* and `token_endpoint` is
 * *"REQUIRED unless only the implicit grant type is supported"* — both conditional on the server's own
 * configuration, so both are optional here rather than asserting a condition this app cannot evaluate.
 *
 * **`userinfo_endpoint` is not an RFC 8414 member at all.** It is OpenID Connect Discovery 1.0's, and
 * this deployment serves the same document at both well-known paths. `McpSection`'s wizard reads it, so
 * it is modelled — as optional, with its provenance stated, because a pure OAuth 2.0 authorization
 * server is entirely correct to omit it.
 */
export const asMetadataSchema = z.looseObject({
  issuer: z.string(),
  response_types_supported: z.array(z.string()),
  authorization_endpoint: z.optional(z.string()),
  token_endpoint: z.optional(z.string()),
  jwks_uri: z.optional(z.string()),
  registration_endpoint: z.optional(z.string()),
  introspection_endpoint: z.optional(z.string()),
  revocation_endpoint: z.optional(z.string()),
  code_challenge_methods_supported: z.optional(z.array(z.string())),
  /** OpenID Connect Discovery 1.0, not RFC 8414 §2 — see the note above. */
  userinfo_endpoint: z.optional(z.string()),
});

/**
 * RFC 7662 §2.2 — the introspection response.
 *
 * **`active` is the only REQUIRED member**, and everything else is *"OPTIONAL"* — which is not a
 * technicality: §2.2 makes the omission of a claim indistinguishable from its absence on the token, so
 * an introspection body carrying nothing but `{"active": false}` is fully conformant.
 *
 * `cnf` is RFC 7800, surfaced by RFC 9449 §6.1 as `cnf.jkt`. It is the one member here that decides
 * something in this app: **it, not the scheme the caller chose, is what makes a token
 * sender-constrained.**
 */
export const introspectionSchema = z.looseObject({
  active: z.boolean(),
  scope: z.optional(z.string()),
  client_id: z.optional(z.string()),
  token_type: z.optional(z.string()),
  exp: z.optional(z.number()),
  iat: z.optional(z.number()),
  sub: z.optional(z.string()),
  aud: z.optional(z.union([z.string(), z.array(z.string())])),
  acr: z.optional(z.string()),
  auth_time: z.optional(z.number()),
  cnf: z.optional(z.looseObject({ jkt: z.optional(z.string()) })),
});

/**
 * `GET /api/health` — this deployment's own, so there is no RFC to cite and no conformance word to
 * quote. All three are required because this server always sends all three and `useServerStatus` polls
 * it every 30 seconds: a shape change here is worth hearing about immediately rather than as a status
 * badge that quietly reads "Unknown" forever.
 */
export const healthSchema = z.looseObject({
  status: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
});

/**
 * `GET /api/health/all` — the aggregate. `checks.redis` is required because Redis is the live session
 * store on this deployment, and "not configured" and "disconnected" are genuinely different diagnoses
 * that the section renders differently. `checks.authlete` is optional: the aggregate does not always
 * include it, and the section fetches it separately anyway.
 */
export const overallHealthSchema = z.looseObject({
  status: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
  checks: z.looseObject({
    redis: z.looseObject({
      healthy: z.boolean(),
      connected: z.boolean(),
      configured: z.boolean(),
      error: z.optional(z.string()),
    }),
    authlete: z.optional(z.unknown()),
  }),
});

export type TokenResponseBody = z.infer<typeof tokenResponseSchema>;
export type ParResponseBody = z.infer<typeof parResponseSchema>;
export type DeviceAuthorizationBody = z.infer<typeof deviceAuthorizationSchema>;
export type DcrRegistrationBody = z.infer<typeof dcrRegistrationSchema>;
export type AsMetadataBody = z.infer<typeof asMetadataSchema>;
export type IntrospectionBody = z.infer<typeof introspectionSchema>;
export type HealthBody = z.infer<typeof healthSchema>;
export type OverallHealthBody = z.infer<typeof overallHealthSchema>;
