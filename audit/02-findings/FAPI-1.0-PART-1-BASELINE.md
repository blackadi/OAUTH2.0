# Financial-grade API Security Profile 1.0 — Part 1: Baseline

- **Verdict:** `MISCONFIGURED`
- **Severity:** **S3**
- **Status:** OpenID **Final**, **12 March 2021** — re-verified against the primary source this session
- **Authlete version:** 3.0 (`Service.fapiModes`; Authlete's FAPI 1.0 modes are distinct from `FAPI2_*`)
- **Repo docs under test:** `docs/curriculum/SPEC-INVENTORY.md`, `docs/curriculum/modules/10-fapi-and-grant-management/`, `docs/FAPI-TUTORIAL.md`

<thinking>
1. AS-facing shall statements (§5.2.2): authenticate confidential clients with **mTLS, `client_secret_jwt` or
   `private_key_jwt`**; **require PKCE with S256**; TLS 1.2+ everywhere with a server-certificate check;
   **exact** `redirect_uri` matching against pre-registered values; return an ID Token whose `sub` is the
   authenticated user when `openid` is requested. Access tokens under 10 minutes unless sender-constrained is a
   **should**, not a shall. The implicit grant is not prohibited by a shall statement — worth noting precisely,
   because it is easy to assume otherwise.
2. Authlete boundary: enforcement is Authlete's, gated by `fapiModes`. No AS code.
3. Code: nothing FAPI-1.0-specific. `computeFapiMode` (`fapi.controller.ts:5-20`) only recognises `FAPI2_SECURITY`
   and the `FAPI2_MESSAGE_SIGNING_*` prefix — it cannot represent FAPI 1.0 at all.
4. Docs: `SPEC-INVENTORY.md` has rows for Part 1 and Part 2; Module 10 teaches FAPI; `FAPI-TUTORIAL.md` is
   FAPI 2.0-oriented.
5. Delta: the profile is unenabled, and three of five shall statements are configured against — but two of the
   five are *met*, which distinguishes this from FAPI 2.0's one-in-eight.
6. Two things worth getting right rather than assuming: whether `client_secret_jwt` counts (it does for Part 1,
   unlike FAPI 2.0), and whether the 10-minute token lifetime is a shall (it is not).
</thinking>

## Normative requirements (AS side) versus the live configuration

| # | §5.2.2 shall | Live value | Status |
|---|---|---|---|
| 1 | Authenticate confidential clients with **mTLS**, **`client_secret_jwt`** or **`private_key_jwt`** | the one confidential client uses `CLIENT_SECRET_BASIC`; no client has a JWKS | ❌ |
| 2 | **Require PKCE with `S256`** | `pkceRequired = false`, `pkceS256Required = false` | ❌ |
| 3 | TLS 1.2+ for all communications, with an RFC 6125 server-certificate check | terminated upstream by the platform / ngrok tunnel; Authlete's own APIs are HTTPS | ✅ **met by deployment**, not by this code (`server.ts` speaks HTTP) |
| 4 | **Exact** `redirect_uri` matching against pre-registered URIs | Authlete's, and verified: the authorization endpoint rejects a non-matching URI with 400 and no `Location` (`PROGRESS.md:1046-1047`) | ✅ |
| 5 | Return an ID Token whose `sub` is the authenticated user when `openid` is requested | verified live in Module 08 (`lab.md:94-107,148-173`) | ✅ |
| 6 | Access tokens under 10 minutes unless sender-constrained — **should**, not shall | `accessTokenDuration = 86400` (24 h), tokens not sender-constrained | ❌ **should** unmet, and by 144× |
| — | `fapiModes` set to a FAPI 1.0 mode | **absent**, and `computeFapiMode` cannot represent one | ❌ |

**Three of five shall statements met** — a materially better position than FAPI 2.0's one of eight, because
Part 1 is the baseline profile and much of it is ordinary good practice this deployment already has.

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Enforcing the profile | Authlete, gated by `fapiModes` | not enabled |
| Exact redirect-URI matching | Authlete | verified working |
| TLS termination | The platform | outside this codebase — the same fact underlying the mTLS decline (`RFC8705-mutual-tls.md`) |
| Token lifetime | Service configuration | `accessTokenDuration = 86400` |
| Reporting a FAPI 1.0 posture | **This server** — and it cannot | `computeFapiMode` recognises only FAPI 2.0 modes — F-2 |

## Finding F-1 — the 24-hour access token misses the baseline's central lifetime guidance by two orders of magnitude (S3)

§5.2.2: the AS *"should issue access tokens with a lifetime of under 10 minutes unless the tokens are
sender-constrained."* Live: `accessTokenDuration = 86400`, and no client requires DPoP or certificate binding, so
the sender-constrained escape clause does not apply.

**A should, stated as a should** — this is not a conformance violation, and the audit should not inflate it. What
makes it worth recording is how many other findings converge on this one number:

| Finding | Dependence on `accessTokenDuration = 86400` |
|---|---|
| `GRANT-MANAGEMENT.md` F-1 | Grant revocation leaves access tokens alive 24 h; the §6.5 **should** gap is only tolerable on short tokens |
| `RFC8693-token-exchange.md` | Exchanged tokens inherit the 24 h default — the third deliberate defect |
| `OIDC-CORE-1.0.md` F-3 | 24 h ID tokens *and* access tokens; 10-day refresh tokens |
| This entry | The baseline's 10-minute guidance |

**One configuration change closes part of four findings**, which is why `GM-W1` / `OIDC-W4` should be read as the
same item. That convergence is more useful than any of the individual rows.

## Finding F-2 — the deployment cannot report a FAPI 1.0 posture even in principle (S3)

`controllers/fapi.controller.ts:5-20`:

```ts
const hasSecurityProfile = fapiModes.includes("FAPI2_SECURITY");
const hasMessageSigning = fapiModes.some((m) => m.startsWith("FAPI2_MESSAGE_SIGNING_"));
if (hasSecurityProfile && hasMessageSigning) return "ms";
…
return "disabled";
```

The function's domain is `"sp" | "ms" | "disabled"`. Authlete's `fapiModes` can express FAPI 1.0 modes, and this
mapper collapses every one of them to `"disabled"` — so a service configured for FAPI 1.0 Baseline or Advanced
would be reported as having FAPI switched **off**.

Not exploitable, and unreachable today because `fapiModes` is absent and `service.get()` throws
(`FAPI-2.0-SECURITY-PROFILE.md` F-1). Recorded because the repo's docs treat `/api/fapi/*` as *the* FAPI posture
instrument, `SPEC-INVENTORY.md` carries rows for both FAPI 1.0 parts, and Module 10 teaches both — so the
instrument silently cannot see half of what the curriculum covers.

## Finding F-3 — `AGENTS.md` states the request-object lifetime requirement as 60 **seconds**; the spec says 60 **minutes** (S2)

`AGENTS.md`'s service-flag table, on `nbfOptional: false`:

> Enforce request object lifespan **≤60s** for FAPI 1.0 compliance

FAPI 1.0 Part 2 §5.2.2, quoted from the primary source this session:

> shall require the request object to contain an `exp` claim that has a lifetime of no longer than **60 minutes**
> after the `nbf` claim

and

> shall require the request object to contain an `nbf` claim that is no longer than **60 minutes** in the past.

So the requirement is a 60-**minute** window, in both directions, and `AGENTS.md` states 60 seconds — a 60×
error in the tightening direction. The flag value it recommends (`nbfOptional: false`) is correct and the live
value matches; only the stated rationale is wrong.

**Why S2 rather than S4.** This is the flags table — the most-read reference in the repo, and the file that
governs how contributors configure the service. A reader implementing a FAPI 1.0 client from it will mint request
objects with a 60-second window and conclude their AS is broken when a 5-minute-old object is accepted; a reader
configuring an AS may look for a 60-second enforcement knob that does not exist. It is also precisely the class of
error the repo's own specification-accuracy rule exists to prevent — *"Verify every spec identifier … against the
primary source before citing it"* — applied to a numeric bound rather than a document title.

Note this belongs to Part 2 (Advanced), not Part 1, but it is recorded here because it sits in the flags table
alongside the other FAPI-1.0-labelled entries; `FAPI-1.0-PART-2-ADVANCED.md` cross-references it.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title *"Financial-grade API Security Profile 1.0 - Part 1: Baseline"*, Final, **12 Mar 2021** | `SPEC-INVENTORY.md` | **Confirmed** against `openid.net/specs/openid-financial-api-part-1-1_0.html` this session | **Accurate** |
| "Enforce request object lifespan ≤60s for FAPI 1.0 compliance" | `AGENTS.md` flags table | §5.2.2 says 60 **minutes** — F-3 | `DOC_INCORRECT` / **S2** |
| `nbfOptional: false` recommended | `AGENTS.md` flags table | Correct requirement, correct live value (`nbfOptional = false`), wrong rationale | **Accurate flag, wrong reason** |
| Module 10 teaches FAPI 1.0 and 2.0 | `modules/10…/` | Not read line-by-line here; carried to Phase 3. The profile being unenabled means no lab step can show FAPI 1.0 enforced — consistent with `PROGRESS.md`'s own note | **Deferred to Phase 3** |
| Nothing states that `computeFapiMode` cannot represent FAPI 1.0 | `AGENTS.md`, Module 10 | F-2 | **Omission** / S3 |
| `docs/FAPI-TUTORIAL.md` is FAPI 2.0-oriented throughout | whole file | Accurate to its scope; a reader looking for FAPI 1.0 Baseline finds only Module 10 | **Accurate** |

## Sources consulted

- FAPI 1.0 Part 1: Baseline §5.2.2 — `https://openid.net/specs/openid-financial-api-part-1-1_0.html`, fetched this session. Quoted: the three permitted client-authentication methods, *"shall require RFC7636 with S256"*, the TLS 1.2+/RFC 6125 requirements, *"shall require the value of `redirect_uri` to exactly match one of the pre-registered redirect URIs"*, the `sub` requirement, and the 10-minute **should**.
- FAPI 1.0 Part 2: Advanced §5.2.2 (for F-3's 60-minute bound) — `https://openid.net/specs/openid-financial-api-part-2-1_0.html`
- Live probes 1–3 (2026-08-10): `fapiModes`, `pkceRequired`, `pkceS256Required`, `accessTokenDuration`, per-client `tokenAuthMethod` / `jwksUri` / `dpopRequired` — `SERVICE-CONFIG-PROBE.md` §2–§10
- Repo-sourced live evidence: `PROGRESS.md:1046-1047` (exact redirect-URI matching at the authorization endpoint), `modules/08…/lab.md:94-107,148-173` (`sub` in the ID token)
- Code: `controllers/fapi.controller.ts:5-20`, `server/src/server.ts` (plain `app.listen`)

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| FAPI1-W1 | **Fix the 60s/60min error in `AGENTS.md`** | S | The flags table quotes §5.2.2's 60-minute bound in both directions and cites the URL. Smallest, highest-certainty fix in this batch. |
| FAPI1-W2 | Make `computeFapiMode` total over Authlete's `fapiModes` | S | FAPI 1.0 modes map to their own return values rather than `"disabled"`; an unrecognised mode is reported as unknown, not off. Test per mode. |
| FAPI1-W3 | Shorten `accessTokenDuration` | S | ⬜ **OPEN — deliberately, decided 2026-08-12 (T1-4).** = **GM-W1** / **OIDC-W4**. Applied and reverted in one session: at 3600 the FAPI §5.2.2 guidance is met, but **Module 07's audit lab** ranks the 24-hour lifetime as finding (iv) and **Module 10's thesis** rests on it, so ~55 references and two modules' arguments move with the flag. Recorded rather than silently deferred; the write is proven and reversible. |
| FAPI1-W4 | Decide whether FAPI 1.0 is claimed | S | **Gate 4**, with **FAPI2-W5**. Part 1 is three-fifths met already, so "enable Baseline" is a smaller step than FAPI 2.0 — but it still requires PKCE-S256 mandatory and a JWKS-bearing client, which collides with the retired-grant exercises. |

**Ordering.** FAPI1-W1 first — it is one line and it is a spec-accuracy defect in the repo's most-read reference
file. FAPI1-W3 should be scheduled once, for all four findings that want it.
