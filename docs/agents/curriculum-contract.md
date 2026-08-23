<!-- Loaded on demand, not by default. `AGENTS.md` is the obligation; this file is the explanation. -->

# The curriculum contract

> **Read this before** changing server behaviour or Authlete configuration. Labs are prose: nothing
> in the build or the test suites will tell you that a change invalidated one.

### Deliberate defects — do not "fix" these without updating the curriculum

Some behaviour in this repo is **intentionally wrong** because a module teaches it. Fixing it silently
breaks a lab, and nothing in the build or test suites will tell you: labs are prose. This already
happened once — pinning the SDK to 1.0.0 fixed a schema bug that Module 06's gate was built on, and the
gate had to be rebuilt.

| File | Deliberate gap | Taught by | Locked by |
|------|----------------|-----------|-----------|
| `controllers/token-exchange-response.handler.ts:47-52` — the `tokenCreateRequest` literal, under the ⚠️ *"four request parameters are dropped here"* comment | Drops `resources`, `audiences`, `actorToken`, `requestedTokenType`; passes no lifetime. So `resource`/`audience` do not audience-restrict, `actor_token` downgrades delegation to impersonation, and tokens live 24h | Module 06 Exercise 6b | `tests/unit/controllers/token-exchange-response.handler.test.ts` |
| same, the response body at `:69-76` — under the ⚠️ comment naming §2.2.1 | Omits `issued_token_type` (RFC 8693 §2.2.1 **REQUIRED**); emits non-spec `client_id`/`subject` | Module 06 Exercise 6a | same |
| same, `:32` — the `const subject = result.subject \|\| subjectToken;` line | `result.subject \|\| subjectToken` puts a live access token in an identity field when Authlete resolves no subject | Module 06 Exercise 6c | same |

The characterization test asserts the current behaviour and names the docs to update, so a change fails
loudly instead of rotting a lab. If you change any of these on purpose, update Module 06's lab and
quiz-answers, `docs/TOKEN-EXCHANGE-TUTORIAL.md` (Part 12 and Parts 7/9/11), and the `PROGRESS.md` Build
Log.

**After any change to server behaviour**, grep the curriculum for the symptom you changed —
`grep -rn "<the error string>" docs/curriculum/modules` — before assuming nothing else is affected.

**And after any change to Authlete *configuration*, that grep does not fire — so do a different one.** A
service flag has no error string. When you enable a feature, the strings that change are the ones that were
there *because it was off*, and you cannot search for a string you are about to create. This is not
hypothetical: **DR-03 enabled verifiable credentials on 2026-08-14 and silently invalidated an entire Module
09b exercise** — four transcripts, two observations drawn from them and two `UNVERIFIED` markers — plus a
`SPEC-INVENTORY.md` row and a status line in the module README. DR-05 and DR-11 did the same to
`MCP-OAUTH-TUTORIAL.md` and two `iss` transcripts. Nothing in the build, the tests or `check-docs.mjs` could
notice, because **labs are prose**. The searches that do work:

```bash
# the flag itself, and the vocabulary of it being off
grep -rn "verifiableCredentialsEnabled\|not enabled\|switched off\|disabled on this service" docs/
# the vendor result codes that only occur while the feature is off
grep -rn "A364301\|A416301\|A402301" docs/
# anything asserting the old value of a field you changed
grep -rn "blackadi.dev" docs/          # after DR-11 moved `issuer`
```

**The rule: search for the behaviour the flag gated, not for a string.** Every transcript that shows that
behaviour *refusing* is now wrong, and every sentence explaining *why* it refuses is wrong with it.
