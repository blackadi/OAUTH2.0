# Scope Attributes and Client Attributes (Authlete vendor features)

- **Verdict:** `CODE_ONLY` (client attributes) + `ABSENT` (scope attributes)
- **Severity:** **S3**
- **Status:** Not specifications — two Authlete features (`configuration-reference/tokens-and-claims/scope-attributes`, `configuration-reference/client-management/client-attributes`)
- **Authlete version:** 3.0
- **Repo docs under test:** **none** — `00-inventory.md` §10 flagged it: *"Group B; `services/client.management.service.ts:488` sets `attributes` undocumented"*

<thinking>
1. No specifications, so no normative requirements. Two related vendor features: arbitrary key/value pairs
   attachable to a **scope** and to a **client**.
2. Authlete boundary: storage and retrieval. Scope attributes additionally *drive behaviour* — the `regex` key is
   what makes a scope parameterized (`PARAMETERIZED-SCOPES.md`), so a scope attribute is not inert metadata.
3. Code: client attributes are **settable** through the admin API (`client.management.service.ts:488-489`) and
   nothing reads them. Scope attributes have no surface at all.
4. Docs: nothing, in either case. The admin API accepts a field no document describes.
5. Delta: an undocumented write path into vendor configuration — and, in the scope case, a missing surface for a
   mechanism the repo would need if it ever wanted parameterized scopes.
6. The severity question: is an undocumented pass-through field S3 or S4? S3, because `attributes` is typed `as any`
   and written straight to Authlete with no validation, on an endpoint that reconfigures clients.
</thinking>

## What exists, and what does not

| Feature | Authlete surface | This repo |
|---|---|---|
| **Client attributes** | `attributes` on the client model — arbitrary key/value pairs | ⚠️ **settable, undocumented, unread** — `services/client.management.service.ts:488-489` |
| **Scope attributes** | `attributes` on the scope model; the `regex` key makes a scope parameterized | ❌ **no surface at all** — scopes are not managed by this repo |
| Reading either back | Present on the models Authlete returns | ❌ neither is read anywhere |
| Documentation | — | ❌ none in `docs/`, `AGENTS.md` or the curriculum |

```ts
// server/src/services/client.management.service.ts:488-489
if (payload.attributes !== undefined && Array.isArray(payload.attributes)) {
  input.attributes = payload.attributes as any;
}
```

That is the whole implementation: an array-shaped pass-through with an `as any` cast, reachable via
`PUT /api/client/update` behind admin Basic auth.

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Storing and returning attributes | Authlete | client and scope models |
| **Interpreting** the `regex` scope attribute as a parameterized-scope rule | Authlete | see `PARAMETERIZED-SCOPES.md` |
| Writing client attributes | **This server** | `client.management.service.ts:488-489` |
| Writing scope attributes | *nobody* — the repo manages no scopes | — |
| Validating what is written | **This server** | **nothing** — F-1 |
| Documenting the field | **This server** | nothing — F-2 |

## Finding F-1 — an unvalidated, untyped write path into vendor configuration (S3)

`attributes` is accepted from the request body, checked only for being an array, cast with `as any`, and forwarded
to Authlete. There is no shape validation (each element should be a key/value pair), no key allowlist, and no size
bound.

Three reasons this is S3 rather than S4:

1. **Scope attributes are behavioural, and client attributes are the same mechanism.** The `regex` key on a *scope* attribute changes how Authlete matches scopes. Attributes are therefore not guaranteed-inert metadata in general — they are a namespace Authlete reads keys from. Writing arbitrary keys into a namespace whose semantics the vendor defines is the kind of thing that becomes a behaviour change when a vendor adds a key.
2. **`as any` defeats the one check available.** Every sibling field in that mapper is coerced with an explicit `String()`/`Boolean()`/`Number()` or validated against a typed enum; this one is not. `00-inventory.md` §7 already lists `attributes` among the settable client-metadata fields without noting it is the only untyped one.
3. **It is on the client-management surface**, which reconfigures live clients. `AGENTS.md`'s **Security-critical surfaces** list does not include `client.management.service.ts`, which is defensible for most of its 100-plus fields — but this particular field is a typed hole in an otherwise carefully coerced mapper.

Not exploitable as far as I can establish: the caller must already hold `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`, and
`requireBasicAuth` fails closed. So this is a robustness and hygiene finding, not a vulnerability — recorded at S3
because of what the field *is*, not what an attacker could do with it today.

## Finding F-2 — the admin API accepts a field no document describes (S3)

`docs/API.md` documents the client-management endpoints and does not mention `attributes`. Nor does `AGENTS.md`,
which describes the client-metadata mapper in detail (`00-inventory.md` §7 enumerates the field groups) and lists
`attributes` only as a bare name in the "arrays incl." group.

So an operator using the admin API cannot learn from the documentation that the field exists, what shape it takes,
or that Authlete assigns meaning to certain keys. And a contributor reading the mapper finds a single `as any` line
with no comment.

This is the same class as `HSK-hardware-security-keys.md` F-1 — an implemented Authlete surface outside the
documentation set — and the two should be fixed together, since both are `docs/API.md` omissions plus a
`SPEC-INVENTORY.md` row.

## Finding F-3 — there is no scope-management surface at all, which blocks two features (S3)

The repo manages clients (16 endpoints) and never manages **scopes**. Scopes are configured only in the Authlete
console, and the live set is fixed (`scopes_supported`: `address`, `email`, `openid`, `offline_access`, `phone`,
`profile`, `grant_management_query`, `grant_management_revoke` — probe 2 §6).

Consequences beyond this row:

- **Parameterized scopes are unreachable** (`PARAMETERIZED-SCOPES.md`): the feature is configured by adding a `regex` **scope attribute**, and there is no code path or documented console step for doing so in this repo.
- **Scope attributes cannot be demonstrated** even though client attributes can be written, so the two halves of one vendor feature have asymmetric availability with nothing recording why.
- Module 04 teaches scopes and audience restriction and Module 06 teaches scope narrowing; neither can show a scope being *configured*, only requested.

Whether to add a scope-management surface is a Gate 4 question. My recommendation is no — 16 client endpoints
already exceed what the curriculum exercises, and the console is the honest place for service-level configuration —
but the *absence* should be stated rather than left implicit, because two Group B features depend on it.

## Scope recommendation — document both, validate the one that is implemented

Group B requires implementation or justification:

- **Client attributes:** already implemented. Document the field in `docs/API.md`, validate its shape, and drop the `as any`. Small, and it closes F-1 and F-2 together.
- **Scope attributes:** justify as document-only. No AS code is required for the feature itself; the missing piece is a scope-management surface, which is out of proportion to the benefit.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| `attributes` listed among settable client-metadata fields | `00-inventory.md` §7 (audit) | Accurate, and does not note it is the only untyped one | **Accurate**, incomplete |
| `docs/API.md` documents the client-management endpoints | `docs/API.md` | Omits `attributes` entirely — F-2 | `DOC_INCORRECT` / S3 |
| `AGENTS.md` describes the client-metadata mapper | `AGENTS.md` | Names `attributes` without describing shape or semantics | **Incomplete** / S3 |
| No `SPEC-INVENTORY.md` row for either feature | — | Confirmed | **Omission** / S3 |
| Nothing states that scopes are unmanaged by this repo | all docs | F-3 — and two Group B features depend on it | **Omission** / S3 |

## Sources consulted

- Authlete, Scope Attributes — `configuration-reference/tokens-and-claims/scope-attributes`, and Client Attributes — `configuration-reference/client-management/client-attributes`; both resolved through `llms.txt` in Phase 0 (`00-inventory.md` §10, `01-spec-matrix.md` §2). **Neither page was fetched this session**; the behavioural fact this entry relies on — that the `regex` **scope attribute** drives parameterized scopes — comes from the parameterized-scopes page, which **was** fetched (see `PARAMETERIZED-SCOPES.md`). Marked so the provenance is not overstated.
- Live probe 2 (2026-08-10): `scopes_supported` (eight scopes) — `SERVICE-CONFIG-PROBE.md` §6
- Code: `services/client.management.service.ts:488-489`, and the surrounding mapper `:391-493` for the coercion contrast; `docs/API.md`
- Cross-references: `PARAMETERIZED-SCOPES.md`, `HSK-hardware-security-keys.md` F-1

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| ATTR-W1 | Validate and type the `attributes` field | S | ✅ **DONE 2026-08-14.** `clientAttributesSchema` (`src/utils/validation.ts`) replaces the `as any` in `buildClientInput`. **Two rejected shapes, not one:** an invalid array is no longer forwarded verbatim, *and* a **non-array is no longer silently dropped** — the old `Array.isArray` guard made a malformed write answer 200 while storing nothing, which is the worse of the two failures because it reports success. **Deliberately stricter than the SDK on one point:** `Pair` makes *both* members optional, so `[{}]` satisfies it, but a keyless attribute is unaddressable and the namespace is not inert — Authlete assigns meaning to some keys, which is how the `regex` *scope* attribute drives parameterized scopes (F-3). `value` stays optional, matching `Pair`. Create and update share the mapper and a test asserts both. 11 cases in `tests/unit/services/client.management.service.test.ts`. |
| ATTR-W2 | Document `attributes` in `docs/API.md` | S | ✅ **DONE 2026-08-14 (T2-16).** Shape, an example, and the non-inert-namespace note with **two** vendor-assigned keys rather than one: `regex` on a *scope* makes it parameterized, and `fapi2=sp` is what makes Authlete enforce FAPI per request — the second being the more useful example, because `FAPI-TUTORIAL.md` Part 3 already depends on it. Adds the practical advice the finding implies: **prefix your own keys**, since a name you invent may collide with one Authlete defines later. Also records the ATTR-W1 validation outcome — malformed *and* non-array are now 400, where a non-array used to be silently dropped and answer 200. |
| ATTR-W3 | Add `SPEC-INVENTORY.md` rows for both features | S | Both labelled **vendor feature, not a specification**, alongside **HSK-W2** and **PS-W1**. |
| ATTR-W4 | State that this repo manages no scopes | S | ✅ **DONE 2026-08-14 (T2-16), in both places rather than one.** `docs/API.md` carries a two-row table naming exactly the features it blocks — **parameterized scopes** (needs a `regex` scope attribute) and **FAPI per-request enforcement** (needs `fapi2=sp`) — and notes that this is why `FAPI-TUTORIAL.md` Part 3 sends the reader to the console. Module 04 states it as the reason the parameterized-scope paragraph there ends *"you cannot try it here."* |
| ATTR-W5 | *(Not recommended)* Add a scope-management surface | L | Would unblock scope attributes and parameterized scopes. Out of proportion — see F-3. |

**Ordering.** ATTR-W1 is the only code item and is small. W2/W3 batch with the HSK and parameterized-scopes
documentation work as one `docs/API.md` + `SPEC-INVENTORY.md` edit covering all three vendor features.
