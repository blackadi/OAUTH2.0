# Cross-cutting — the error handler returns Authlete's HTTP status, so a failed SDK response validation is served as **200 OK**

> ## ✅ FIXED 2026-08-11 — EH-W1 and EH-W2 shipped
>
> `middleware/errorHandler.ts` now derives the status through `errorStatusFrom()`, which trusts an
> error-supplied `status`/`statusCode` **only inside 400–599** and returns 500 otherwise. `AppError` keeps
> its deliberate values on its own branch. Both FAPI endpoints now answer **500**, not 200.
>
> - **EH-W1** ✅ — the clamp, with the mechanism documented in a comment so it is not "simplified" back.
> - **EH-W2** ✅ — `tests/unit/routes/fapi.routes.test.ts` mounts the real handler and asserts that a
>   `statusCode: 200` rejection from `service.get()` answers 500 on **both** endpoints. Four more cases in
>   `tests/unit/middleware/errorHandler.test.ts` (2xx, 3xx, non-numeric, and `AppError` verbatim).
> - **EH-W3** ✅ — `AGENTS.md`'s `SPIFFE_JWT` paragraph now separates the two layers and names the third
>   escape route.
> - **EH-W4** ✅ — Module 10 Exercise 4 reframed around *two defects, one symptom*; the 200 kept as a dated
>   historical transcript. **Not retired** — dropping `SPIFFE_JWT` is still what would do that.
> - **EH-W5** ✅ — sweep done. Two other sites read a status from an error and **neither needs the clamp**:
>   `controllers/jwks.controller.ts:17` already catches `statusCode === 204` locally and converts it to an
>   empty key set (independent corroboration that SDK errors carry 2xx), and `services/health.service.ts:45-51`
>   builds its own result object without routing through the handler — which is the behaviour `AGENTS.md`
>   documents and which the clamp must not disturb.
>
> ~~**What is NOT fixed:** the SDK enum gap.~~ **Also closed, 2026-08-12 (T1-5, DR-07 approved).**
> `SPIFFE_JWT` was withdrawn from `supportedTokenAuthMethods`, `service.get()` parses, and both endpoints
> return **200 with live values**. So F-2's four-row table is now history in all four rows, and **the entry has
> no residue**: severity **S1 → S3 → closed**. Module 10 Exercise 4 was **rebuilt, not retired** — it walks all
> three states (invisible 200 → honest 500 → live data) and lands on the closed-enum lesson, which EH-W4
> predicted would be *"better material"*. Evidence: `SERVICE-CONFIG-PROBE.md` §17–§18.
>
> **The one claim in this entry that got sharper rather than obsolete** is F-1's *"tomorrow: any field Authlete
> adds to any of the 57 called methods whose Zod schema is strict"*. Measured: the `Service` schema is **not**
> strict — it strips the 8 of 193 properties it does not model — so the exposure is narrower than F-1 says for
> *fields* and exactly as bad for *values*. Of 16 enum-typed fields, `ClientAuthMethod` was the only one short,
> and it types **three** service fields. The clamp remains the reason the next one will be visible.

- **Verdict:** ~~`PARTIAL`~~ → **`RESOLVED`** *(not a specification — a structural defect affecting every SDK call site)*
- **Severity:** ~~**S1**~~ → ~~S3~~ → **closed** (status inversion fixed 2026-08-11; the enum-gap residue closed 2026-08-12)
- **Authlete version:** 3.0, SDK 1.0.0
- **Discovered:** while verifying `AGENTS.md`'s claim about the two FAPI endpoints in batch B7
- **Repo docs under test:** `AGENTS.md` (the `SPIFFE_JWT` paragraph), `docs/curriculum/modules/10-fapi-and-grant-management/` Exercise 4, and `RFC7636-pkce.md` F-1 in this audit

> **Why this is its own entry.** It is not specific to FAPI, PKCE or any one specification. It is a single
> conditional in one middleware that converts *any* Authlete response-validation failure into an HTTP success,
> across all 57 SDK call sites. `B1-authlete-boundary.md` is the other non-spec entry; this is its counterpart on
> the error path.

<thinking>
1. `AGENTS.md` asserts that `GET /api/fapi/config` and `GET /api/fapi/status` return **HTTP 200 with an error body
   and a stack trace**. My own B2 entry (`RFC7636-pkce.md` F-1) repeated it. But reading the code, both handlers
   end in `next(error)`, which routes to `middleware/errorHandler.ts` — and an error handler would normally emit
   500. So either the claim was wrong, or something unusual was happening.
2. Traced it: `errorHandler.ts:14-18` derives the HTTP status from the **error object**:
   `Number(err.status || err.statusCode || 500)`. The SDK's thrown error is a `ResponseValidationError`, which
   extends `AuthleteError`, which sets `this.statusCode = httpMeta.response.status` — the status of the
   *successful* Authlete response whose body failed Zod validation. That is **200**.
3. Verified empirically rather than by inference — the transcript is below.
4. So the claim is right and the mechanism was undocumented. And the mechanism generalises: it is not about
   `SPIFFE_JWT`, it is about any 2xx response the SDK cannot parse.
5. This is the highest-severity structural finding in the audit so far, because the failure mode is silence:
   the caller sees a success status.
</thinking>

## The mechanism, verified empirically

Executed against the live service, 2026-08-10, using the repo's own SDK client configuration:

```
threw class : ResponseValidationError | name: ResponseValidationError
statusCode  : 200 (number)
status      : undefined
message     : Response validation failed
>>> errorHandler emits: HTTP 200 | body.error = "Bad Request"
```

The chain, with citations:

| Step | Where | What happens |
|---|---|---|
| 1 | Authlete | Returns **HTTP 200** with a valid 129-field service object (confirmed by raw-HTTP probes 1–3) |
| 2 | SDK 1.0.0 | Zod rejects it — `supportedTokenAuthMethods` contains `SPIFFE_JWT`, absent from the strict `ClientAuthMethod` enum — and throws `ResponseValidationError` (`models/errors/responsevalidationerror.ts`) |
| 3 | SDK 1.0.0 | `ResponseValidationError extends AuthleteError`, and `AuthleteError` sets `this.statusCode = httpMeta.response.status` (`models/errors/authleteerror.ts:8,27`) ⇒ **`statusCode === 200`** |
| 4 | `controllers/fapi.controller.ts:50-55,83-88` | Catches and calls `next(error)` — correct delegation |
| 5 | `middleware/errorHandler.ts:14-18` | `Number(err.status \|\| err.statusCode \|\| 500)` ⇒ **200** |
| 6 | `middleware/errorHandler.ts:38-48` | `status >= 500 ? "Internal Server Error" : … : "Bad Request"` ⇒ body says `"Bad Request"`, response says **200 OK**; with `NODE_ENV=development`, `err.stack` is included |

So the client receives:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"error":"Bad Request","message":"Response validation failed","stack":"ResponseValidationError: …"}
```

**A success status carrying an error body that calls itself a Bad Request.** Three mutually contradictory signals
in one response.

## Finding F-1 — the defect is systemic, not FAPI-specific (S1)

`errorHandler.ts` is mounted once, at `app.ts:178`, for every route. The status-inversion triggers whenever a
thrown error carries a 2xx `statusCode`, which is precisely the shape of **every** `AuthleteError` subclass raised
against a successful Authlete response. That includes:

- **`ResponseValidationError`** — any Authlete response the pinned SDK cannot parse. Today: `service.get()`. Tomorrow: any field Authlete adds to any of the 57 called methods whose Zod schema is strict. `AGENTS.md` already identifies this general fragility — *"any client-auth method Authlete adds breaks `service.get()` for every TypeScript SDK caller whose service enables it"* — but frames the consequence as the two FAPI endpoints. The consequence is actually every endpoint.
- Any future SDK error type inheriting `AuthleteError` while describing a 2xx exchange.

**Failure scenario, and why S1.** A monitoring probe, a CI health check, a load balancer, or a client library
checks the status line. All of them read `200` and conclude success. The `/api/health/authlete` path is
deliberately careful about this distinction — `AGENTS.md` documents that a non-2xx from Authlete is *"a health
**result**, not a transport failure"* — and then the global error handler discards the distinction for everything
else. A deployment can therefore be broken on a monitored endpoint while every monitor reports green. That is the
"silently not applied" failure class `modules/05…/lab.md:790-798` teaches learners to fear, occurring in the
repo's own error path.

The fix is one clause: clamp a status derived from an error object to the 4xx/5xx range, defaulting to 500.
`AppError` (the repo's own type) is unaffected — it carries deliberate 4xx values.

## Finding F-2 — `AGENTS.md`'s claim is correct; its stated cause is incomplete (S3)

`AGENTS.md` says the endpoints *"return **HTTP 200 with an error body and a stack trace**"* and attributes it to
the SDK enum gap. The observable behaviour is exactly right — **the audit confirms the claim rather than
correcting it** — but the attribution stops one layer short:

- The **enum gap** explains why `service.get()` fails.
- The **error handler's status derivation** explains why the failure is served as 200.

Those are separable defects with separable fixes, and the distinction matters for the remediation `AGENTS.md`
itself proposes. It says the escape routes are *"to drop `SPIFFE_JWT` from the service (if unused) or wait for an
SDK that knows it — **not** a `patch-package` patch."* Both listed routes fix only the first layer. Neither
prevents the next unparseable field from being served as a 200, and neither is needed to fix the status inversion,
which is local, one line, and carries no curriculum dependency.

**This also changes the Module 10 Exercise 4 calculus.** `AGENTS.md` warns that fixing the local half retires
that exercise. On the evidence here, the exercise's teaching value — *observe a broken endpoint reporting success*
— is preserved by the enum gap alone: with the status inversion fixed, the endpoints return a clean **500** and
the exercise becomes "find the endpoint that is broken", which is a weaker lesson but still a real one. So the two
decisions are independent:

| Fix | Effect on the endpoints | Effect on Module 10 Ex 4 |
|---|---|---|
| Drop `SPIFFE_JWT` (or upgrade the SDK) | Both work | **Retires the exercise** |
| Clamp the error status | Both return 500 with an error body | Exercise survives, reframed |
| Both | Both work | Retires the exercise |
| Neither | 200 with a stack trace | Status quo |

> **Both shipped (2026-08-11, 2026-08-12), and row 3's prediction was wrong in the useful direction.** The
> exercise was **not** retired. Removing the *subject* of a defect-based exercise does not remove the lesson if
> the lesson is about the mechanism rather than the symptom — the rebuild teaches a **closed client-side enum
> turning a vendor's additive change into a breaking one**, which is only legible *after* the fix, and it now
> has three dated states to compare instead of one. Worth carrying into any future "this fix retires a lab"
> argument: check whether the lab is about the symptom or the mechanism before paying for it.

The second row is the one nobody had identified, and it is available now without touching the curriculum.

## Finding F-3 — the stack trace is gated on `NODE_ENV`, and the status inversion is not (S3)

`errorHandler.ts:36,45-47` gates `err.stack` on `server.nodeEnv === "development"`, so a production deployment
leaks no stack. Good. But the **status** is not gated: production returns `200 {"error":"Bad Request","message":"Response validation failed"}`.

That is arguably worse than the development case, because the stack trace is the one signal that tells an operator
what actually happened. In production the endpoint returns a success status and an error message with no
diagnosis — and `AGENTS.md`'s description ("with a stack trace") describes only the development shape, which may
be why the production shape has not been considered.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Both FAPI endpoints "return **HTTP 200 with an error body and a stack trace**" | `AGENTS.md` | **Confirmed empirically.** The claim is accurate | **Accurate** |
| The cause is the SDK's strict `ClientAuthMethod` enum meeting `SPIFFE_JWT` | `AGENTS.md` | True for *why the call fails*; does not explain *why the failure is a 200* — F-2 | **Accurate but incomplete** / S3 |
| Escape routes are "drop `SPIFFE_JWT` … or wait for an SDK that knows it — **not** a `patch-package` patch" | `AGENTS.md` | Both address only the first layer; a third, independent fix exists — F-2 | **Incomplete** / S3 |
| "Module 10 Exercise 4 teaches the 200-with-stack-trace as a finding, so fixing the local half retires that exercise" | `AGENTS.md` | True of the *enum* half. The status-inversion half can be fixed **without** retiring it — F-2 | **Incomplete** / S3 |
| `/api/health/authlete` treats a non-2xx as a health result, not a transport failure | `AGENTS.md` | Accurate, and a good design — which the global handler then undoes elsewhere | **Accurate** |
| Nothing anywhere states that the error handler derives the HTTP status from the error object | all docs | F-1 — the actual defect | **Omission** / **S1** |

## Sources consulted

- **Live verification, 2026-08-10**: `authleteApi.service.get()` invoked through the repo's own SDK configuration; the thrown class, `statusCode`, and the resulting `errorHandler` computation captured verbatim above. Read-only; the scratch script was deleted after use.
- SDK 1.0.0: `models/errors/responsevalidationerror.ts` (extends `AuthleteError`), `models/errors/authleteerror.ts:8,27` (`statusCode` from the HTTP response), `models/errors/sdkvalidationerror.ts`, `models/clientauthmethod.ts`
- Raw-HTTP probes 1–3 (2026-08-10) establishing that Authlete itself answers 200 — `SERVICE-CONFIG-PROBE.md` §1
- Code: `middleware/errorHandler.ts:14-18,36,38-48`, `controllers/fapi.controller.ts:25-27,50-55,60-62,83-88`, `app.ts:178`, `utils/app-error.ts`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| EH-W1 | **Clamp the derived status to 4xx/5xx** | S | `errorHandler.ts` accepts a status from an error object only when it is 400–599; anything else (including any 2xx) becomes 500. `AppError`'s deliberate statuses are unaffected. A unit test throws an error carrying `statusCode: 200` and asserts the response is 500. **Independent of the `SPIFFE_JWT` decision and of the curriculum.** |
| EH-W2 | Add a regression test at the FAPI routes | S | `tests/unit/routes/fapi*` asserts that when `service.get()` rejects with a `statusCode: 200` error, the route answers 500 — locking the behaviour EH-W1 establishes. |
| EH-W3 | Separate the two layers in `AGENTS.md` | S | The `SPIFFE_JWT` paragraph distinguishes "why the call fails" from "why the failure is served as 200", lists the third escape route, and states that fixing the status inversion does **not** retire Module 10 Exercise 4. |
| EH-W4 | Reframe Module 10 Exercise 4 | S | After EH-W1 the exercise observes a 500 rather than a 200. Either reframe it around the enum gap (which still produces a broken endpoint), or keep the 200 shape as a *historical* transcript labelled as fixed — the pattern `modules/05…/README.md:432-441` already uses for the UserInfo `Bearer`-prefix bug. |
| EH-W5 | Sweep for other 2xx-bearing errors | S | Grep the 57 SDK call sites for anything that surfaces an `AuthleteError` to the global handler on a 2xx exchange; confirm EH-W1 covers them all rather than only this one. |

**Ordering and gating.** EH-W1 is small, self-contained, testable, and blocks nothing — it should go early,
**before** the `SPIFFE_JWT` decision, because it is the half with no curriculum cost. `middleware/errorHandler.ts`
is **not** on the `AGENTS.md` **Security-critical surfaces** list; it decides the HTTP status of every failure in
the application, which makes it the fourth candidate addition to that list found in this audit (with
`routes/device.routes.ts`, `services/logout.service.ts`, `controllers/logout.controller.ts`).
