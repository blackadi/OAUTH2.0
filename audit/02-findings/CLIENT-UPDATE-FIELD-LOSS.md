# `client.management.service.ts` — an allowlist over a replace-semantics API

- **Verdict:** `PARTIAL`
- **Severity:** **S2** — silent data loss on an admin write path, and it can undo a security control
- **Status:** found 2026-08-12 while shipping **T0-4** (RPL-W1). **Not fixed** — recorded by decision, see the
  scope note at the end
- **Authlete version:** 3.0 (API Explorer **3.0.16**, `docs/openapi-spec.json`)
- **Files under test:** `server/src/services/client.management.service.ts` (`buildClientInput`, `update`),
  `server/src/routes/client.routes.ts`

<thinking>
1. Authlete's `POST /api/{serviceId}/client/update/{clientId}` takes a complete client object. The question is
   whether it merges or replaces.
2. `buildClientInput` constructs a `ClientInput` from scratch, copying a named subset of fields from the
   request body. Anything it does not name is absent from the request it sends.
3. If the API replaces, every unnamed field is cleared. If it merges, nothing is lost.
4. I have direct evidence for the *round-trip* case (a complete object survives untouched) but **not** for the
   partial case, because testing it means deliberately dropping a field on a live shared service.
5. So the mechanism is established and the consequence is inferred. Marked accordingly rather than asserted.
</thinking>

## The finding

`buildClientInput` (`server/src/services/client.management.service.ts`) builds Authlete's `ClientInput` by
copying **explicitly named** fields:

```ts
private buildClientInput(payload: Record<string, unknown>): ClientInput {
  const input: ClientInput = {};
  if (payload.clientName !== undefined) input.clientName = String(payload.clientName);
  if (payload.description !== undefined) input.description = String(payload.description);
  // …roughly forty such lines…
}
```

**Authlete's `Client` schema has 108 properties.** Every one this function does not name is absent from the
outbound request — including `backchannelLogoutUri`, `backchannelLogoutSessionRequired`, `bcDeliveryMode`,
`authorizationDetailsTypes`, `defaultAcrs`, `derivedSectorIdentifier` and the rest.

There is a second, independent layer with the same shape. SDK 1.0.0's `ClientInput$outboundSchema` is a plain
`z.object`, so Zod **strips** any key it does not declare; unknown fields survive only through its
`additionalProperties` record, which `buildClientInput` never populates. So even a caller who passed a
complete client body would lose the fields the SDK does not model — which, as
`OIDC-RP-INITIATED-LOGOUT-1.0.md` F-4 records, includes every logout-related one.

## Why it matters now

**T0-4 made a client field load-bearing for a security decision.** The per-client
`post_logout_redirect_uris` registry lives in `POST_LOGOUT_REDIRECT_URIS` rather than in Authlete (F-4), so
*that* particular value is out of reach of this defect. But the general shape stands: an admin using
`PUT /api/client/:clientId` to change one field may silently clear others, and nothing in the response says so.

## What is established, and what is not

| Claim | Status |
|---|---|
| `buildClientInput` sends only the fields it names | ✅ **verified** by reading it |
| SDK `ClientInput` strips unknown keys unless routed through `additionalProperties` | ✅ **verified** — plain `z.object`, no `.catchall()`, versus the inbound schema's `collectExtraKeys$(…, "additionalProperties", true)` |
| A **complete** object round-trips losslessly through `client/update` | ✅ **verified live 2026-08-12** — three clients, 49/48/48 keys, byte-identical afterwards except `modifiedAt` |
| A **partial** object clears the omitted fields | ⚠️ **`UNVERIFIED`** — the natural reading of a replace-style API, and consistent with the round-trip result, but **not tested**: the test is destructive on a shared service. Do not cite it as established |

The distinction matters. The round-trip evidence proves the API *accepts* a full object without damage; it
says nothing about what a *partial* object does. Both readings are live until someone checks on a throwaway
client.

## Work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| CU-W1 | **Establish the merge-vs-replace question** on a disposable DCR-created client | S | Create a client with a distinctive `backchannelLogoutUri`, `PUT` an unrelated single field, read back. Records the answer in `PROGRESS.md` and settles the `UNVERIFIED` row above. Cheap, non-destructive, and it gates whether CU-W2 is needed at all |
| CU-W2 | **Preserve unnamed fields in `buildClientInput`** — route them through the SDK's `additionalProperties` escape hatch | M | A client update that changes one field leaves all others intact, asserted against a mocked SDK. Conditional on CU-W1 |
| CU-W3 | **Read back after a security-relevant configuration write** | S | Any code or runbook step that writes client configuration a security control depends on verifies it by reading it back. F-4's `200`-and-discard is the worked example |

## Scope note

Raised during T0-4 and **deliberately not fixed there**: it is an admin write path, not the logout surface,
and folding it in would have widened a security-critical change past its stated acceptance criteria. Recorded
here so it is visible rather than remembered. **CU-W1 should run before CU-W2** — if Authlete merges rather
than replaces, CU-W2 is unnecessary.

## Sources consulted

- `docs/openapi-spec.json` — Authlete API Explorer **3.0.16**; `Client` schema (108 properties),
  `ClientExtension` (6), `POST /api/{serviceId}/client/update/{clientId}`
- `server/node_modules/@authlete/typescript-sdk/src/models/client.ts` — `ClientInput$outboundSchema` (plain
  `z.object` + `additionalProperties` record) versus `Client$inboundSchema` (`.catchall(z.any())` via
  `collectExtraKeys$`)
- `server/src/services/client.management.service.ts` — `buildClientInput`, `update`
- Live round-trip, 2026-08-12: three clients read, re-sent complete, re-read; no field lost
- `OIDC-RP-INITIATED-LOGOUT-1.0.md` **F-4** — the vendor gap that surfaced this
