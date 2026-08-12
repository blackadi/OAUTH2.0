# Hardware Security Keys (Authlete vendor feature)

- **Verdict:** `CODE_ONLY`
- **Severity:** **S3**
- **Status:** Not a specification — an Authlete Management API feature (`api-reference/hardware-security-key/*`)
- **Authlete version:** 3.0
- **Repo docs under test:** **none exist** — that is the finding. `AGENTS.md` has an HSK paragraph; `docs/` has nothing, and `SPEC-INVENTORY.md` has no row.

<thinking>
1. No specification, so no normative requirements. The audit question is different: four endpoints exist, they
   mutate key material on the Authlete service, and nothing documents them.
2. Authlete boundary: `hardwareSecurityKeys.create/get/delete/list` — pure passthrough. The AS owns routing,
   admin authentication and required-field validation.
3. Code: `services/hsk.service.ts` + `controllers/hsk.controller.ts` + `routes/hsk.routes.ts`. All four endpoints
   behind `requireBasicAuth`, which fails closed. Action maps verified correct in Phase 1, including the
   `NOT_FOUND`-absent-by-design case on `list`.
4. Docs: `AGENTS.md` documents it accurately and it is the *only* place. `00-inventory.md` §10 flagged it: "Group C;
   4 endpoints implemented, zero docs, zero inventory row."
5. Delta: `CODE_ONLY` — implemented and undocumented. The severity comes from what the endpoints do, not from the
   absence of a spec: `DELETE /api/hsk/delete/:handle` destroys a key handle on a shared service.
6. Worth being precise about what "no docs" means here: `AGENTS.md` is an instruction file for agents and
   contributors, not user documentation, and it is not reachable from `docs/README.md`. A reader of the
   documentation set cannot discover these endpoints exist.
</thinking>

## What exists

| Endpoint | Handler | Auth | Action → status |
|---|---|---|---|
| `POST /api/hsk/create` | `controllers/hsk.controller.ts:50` | `requireBasicAuth` | `SUCCESS`→201, `INVALID_REQUEST`→400, `NOT_FOUND`→404, `SERVER_ERROR`→500 |
| `GET /api/hsk/get/:handle` | `:63` | `requireBasicAuth` | `SUCCESS`→200, + same |
| `DELETE /api/hsk/delete/:handle` | `:77` | `requireBasicAuth` | `SUCCESS`→204, + same |
| `GET /api/hsk/list` | `:91` | `requireBasicAuth` | `SUCCESS`→200, `INVALID_REQUEST`→400, `SERVER_ERROR`→500 — **no `NOT_FOUND`** |

`services/hsk.service.ts` validates `kty` and `hsmName` locally (`:20-25`) and passes `kty`, `use`, `kid`,
`hsmName`, `alg` straight through. `handle` is required on get/delete (`:38,52`).

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Key creation, retrieval, deletion, listing on the HSM | Authlete | `hardwareSecurityKeys.*` |
| Routing and admin authentication | **This server** | `routes/hsk.routes.ts:12-15`, `requireBasicAuth` on all four |
| Required-field validation | **This server** | `services/hsk.service.ts:20-25,38,52` |
| Documenting the feature | **This server** | **nothing** — F-1 |

## What this gets right

- **All four endpoints are behind `requireBasicAuth`**, which fails closed when `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` are unset (`middleware/require-basic-auth.ts:57-64`). For endpoints that mutate key material that is the correct posture, and it contrasts with `/api/device/complete`, which has no authentication at all (`RFC8628-…` F-3).
- **The `list` action map correctly omits `NOT_FOUND`.** `HskGetListResponseAction` has exactly `SUCCESS, INVALID_REQUEST, SERVER_ERROR` — verified against the SDK in `01-spec-matrix.md` §6, and one of the four "looks like a bug, is correct" cases from B1. `AGENTS.md` states it explicitly.
- **A unit test exists** — `tests/unit/services/hsk.service.ts` and `tests/unit/controllers/hsk.controller.ts` are both in the counted set (`00-inventory.md` §8), so this is *better* covered than several documented features.

## Finding F-1 — four key-management endpoints with no user-facing documentation and no inventory row (S3)

`00-inventory.md` §10 recorded it: *"Group C; 4 endpoints implemented, zero docs, zero inventory row."* Confirmed:

- `docs/` — no HSK tutorial, no mention in `docs/API.md`'s endpoint reference, no mention in `docs/README.md`;
- `docs/curriculum/SPEC-INVENTORY.md` — no row;
- `AGENTS.md` — a complete and accurate paragraph, but `AGENTS.md` is a contributor/agent instruction file, is not reachable from the documentation index, and is explicitly *not* the documentation set (`CLAUDE.md` designates it the single source of truth for repo facts, not for users).

**Why S3 rather than S4.** `DELETE /api/hsk/delete/:handle` destroys a key handle on the shared Authlete service.
An operator with the management credentials can reach it, and nothing in the documentation tells them it exists,
what it deletes, or whether deletion is recoverable. Undocumented destructive endpoints are how accidents happen —
and this repo's own standard is high here: every other admin surface (token management, client management,
backchannel logout) is covered in `docs/API.md`.

There is also a curriculum consequence: `README.md` advertises a **20-section** client SPA and `docs/API.md`
claims a complete reference for *"40+ endpoints"*. Four endpoints outside that reference means the "complete
reference" claim is inaccurate by four.

## Finding F-2 — the feature has no SPA section, unlike every sibling admin surface (S4)

`00-inventory.md` §2 lists 20 SPA sections; HSK is not among them. Token management, client management, grant
management and health each have one. So HSK is reachable only by hand-crafted HTTP with admin credentials.

Not a defect — a deliberate-looking omission that nothing records as deliberate. Recorded so the Gate 4 decision
covers it: if HSK stays, it either gets documentation or gets removed; leaving it as an undocumented,
un-surfaced, tested, working feature is the one option with no rationale behind it.

## Scope recommendation — document, do not remove

Group C requires an explicit decision. I recommend **document-only, keep the code**:

1. **The code is already correct and tested.** Removing it costs work and loses a working demonstration of an Authlete Management API surface the curriculum otherwise never touches.
2. **It is the only key-management surface in the repo.** The curriculum teaches JWKS, key rotation and `kid` selection (Module 00, Module 05 Step 2's "which JWKS?" trap); HSK is where those ideas meet an HSM, and a short page would connect them.
3. **Removal would be the wrong signal** — the feature is not broken, misconfigured, or unsafe. It is undocumented, which is a documentation fix.

The cheap version is one `docs/` page plus an `API.md` entry plus a `SPEC-INVENTORY.md` row marking it a vendor
feature rather than a specification. No code change.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Four endpoints, admin auth, action→status maps, `kty`/`hsmName` required | `AGENTS.md` HSK paragraph | Matches the code exactly | **Accurate** |
| `HskGetListResponseAction` lacks `NOT_FOUND` by design | `AGENTS.md`; `01-spec-matrix.md` §6 | Confirmed against the SDK | **Accurate** |
| `docs/API.md` is a complete reference for "40+ endpoints" | `docs/API.md`; `00-inventory.md` §9 | Omits all four HSK endpoints | `DOC_INCORRECT` / S3 |
| No `SPEC-INVENTORY.md` row | — | Confirmed | **Omission** / S3 |
| No `docs/` page, no SPA section | — | Confirmed — F-1, F-2 | **Omission** / S3 |

## Sources consulted

- Authlete Hardware Security Key API group — resolved through `llms.txt` in Phase 0 (`00-inventory.md` §10, `01-spec-matrix.md` §3); the individual endpoint pages were **not** fetched this session, and nothing in this entry depends on their content — the verdict rests on the repo's own code, tests and documentation set.
- SDK 1.0.0: `hardwareSecurityKeys.create/get/delete/list`; `HskGetListResponseAction` (`01-spec-matrix.md` §6)
- Code: `services/hsk.service.ts:20-70`, `controllers/hsk.controller.ts:9,19,29,39,50,63,77,91`, `routes/hsk.routes.ts:12-15`, `middleware/require-basic-auth.ts:57-64`
- Repo structure: `00-inventory.md` §2 (20 SPA sections), §8 (HSK tests exist), §10 (the zero-docs finding)

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| HSK-W1 | Add the four endpoints to `docs/API.md` | S | Request/response shapes, the admin-auth requirement, and an explicit note that `DELETE` destroys a key handle on the service. Makes the "40+ endpoints" claim true. |
| HSK-W2 | Write a short `docs/` page and a `SPEC-INVENTORY.md` row | S | The row is labelled a **vendor feature, not a specification** — the same treatment parameterized scopes and scope/client attributes need. The page connects HSK to the key-management material in Modules 00 and 05. |
| HSK-W3 | Record the scope decision | S | Group C decision record: keep, document-only, no SPA section; revisit if an HSM is ever available to demonstrate against. |
| HSK-W4 | No code change | — | Correct, tested, and correctly authenticated. Recording that is the finding. |

**Ordering.** All documentation; independent of everything else in the audit.
