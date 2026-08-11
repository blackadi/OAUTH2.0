# Parameterized Scopes (Authlete vendor feature)

- **Verdict:** `ABSENT`
- **Severity:** **S4**
- **Status:** Not a specification — an Authlete feature (`configuration-reference/tokens-and-claims/using-parameterized-scopes`)
- **Authlete version:** 3.0
- **Repo docs under test:** **none** — the feature is never mentioned in `docs/`, `AGENTS.md`, or the curriculum (`00-inventory.md` §10: *"Group B; never mentioned in repo docs"*)

<thinking>
1. No specification, so no normative requirements. The audit question: is this a gap worth closing, and does it
   interact with anything already found?
2. Authlete boundary: entirely Authlete's, and configured through a **scope attribute** with key `regex`. The
   authorization response carries a `dynamicScopes` array naming the scope and its full value. The doc page states
   **no** AS-side obligation, which I checked for rather than assumed.
3. Code: `dynamicScopes` appears nowhere in `server/src` or `client/src` (grep, zero hits). No scope-attribute
   configuration surface either — `client.management.service.ts:488-489` sets *client* attributes, not scope ones.
4. Docs: nothing.
5. Delta: `ABSENT` — neither implemented nor documented. Genuinely low severity, with two things worth recording:
   it depends on the scope-attributes feature (also absent, `SCOPE-CLIENT-ATTRIBUTES.md`), and it has a
   discovery consequence the page states outright.
6. The temptation is to write this off in two lines. Two things make it worth a real entry: the `dynamicScopes`
   response field is unread, which is a *boundary* fact of the kind B1 catalogued; and the discovery limitation
   interacts with the audit's recurring "advertised versus actual" theme.
</thinking>

## What the feature is, and what it would require here

| Aspect | Detail | This repo |
|---|---|---|
| Configuration | A **scope attribute** with key `regex` and a regular-expression value, e.g. `^consent:.+$` on scope `consent` | ❌ no scope-attribute configuration exists — see `SCOPE-CLIENT-ATTRIBUTES.md` |
| Request | The client sends the dynamic form, e.g. `scope=email consent:urn:bancoex:C1DD33123` | ⊘ rides inside the opaque `parameters` string; nothing to implement |
| Validation | Authlete matches the scope against the configured regex | ⊘ Authlete's |
| Authorization response | Authlete returns a **`dynamicScopes`** array containing the scope name and the full value | ❌ **never read** — F-1 |
| Resource server | Can check a specific parameterized scope via introspection by naming it in the request | ⚠️ `services/introspection.service.ts:27-31` does forward caller-supplied `scopes`, so this half would work |
| Discovery | *"Only the scope name will be shown in a discovery document"* — parameterized variants never appear in `scopes_supported` | ⊘ Authlete's — F-2 |
| AS-side obligation | The page states **none** | ✅ consistent with there being no code |

## Finding F-1 — `dynamicScopes` is an unread response field (S4)

Authlete returns a `dynamicScopes` array on the authorization response when a parameterized scope is matched. Grep
over `server/src` and `client/src`: **zero occurrences**.

That is correct today — no scope is configured with a `regex` attribute, so the field is never populated. It is
recorded because it belongs to the same class B1 catalogued: Authlete surface the repo does not consume. The
existing register (`01-spec-matrix.md` §6) lists `AuthorizationTicketInfoResponseAction`, the three VCI `*Parse*`
APIs, and `GrantManagementAction`'s `CREATE`/`REPLACE`/`MERGE`; `dynamicScopes` extends it.

**The consequence if the feature were switched on without touching the code:** the consent screen
(`views/consent.ejs`) renders `scopes` from the authorization response, so a user consenting to
`consent:urn:bancoex:C1DD33123` would be shown the scope list Authlete returns — and the *parameter value*, which
is the part that identifies **which** consent record is being authorised, lives in `dynamicScopes`. So enabling the
feature without reading that field produces a consent screen that hides the only distinguishing detail. That is
the same failure mode as RAR's consent rendering (`RFC9396-…` F-2), and it is why this row is worth more than a
one-liner.

## Finding F-2 — the discovery limitation is the audit's recurring theme, from the other direction (S4)

Authlete's page states plainly: *"Only the scope name will be shown in a discovery document"* — parameterized
variants do not appear in `scopes_supported`.

Every other instance of the advertised-versus-actual gap in this audit runs one way: the metadata claims more than
the deployment can do (JARM's four response modes, mTLS client-auth methods, five grant-management actions). This
one runs the other way — the metadata would understate what the AS accepts, **by design and unavoidably**.

That is a genuinely good teaching point and the repo has the perfect place for it: `modules/09a…/lab.md:120-124`
already distinguishes *"supported but not required"* from *"permitted but not configured"*. Parameterized scopes
supply a third state — *accepted but unadvertisable* — with a vendor citation. Recording it as the one useful thing
this row contributes.

## Scope recommendation — document-only, one paragraph

Group B requires implementation or justification. I recommend **document-only**:

1. **There is no code to write.** The page states no AS-side obligation, and the only field the repo would need to consume (`dynamicScopes`) matters solely on the consent screen — and only once a `regex` scope attribute exists.
2. **It is a vendor feature, not a specification**, so it carries no conformance weight. Nothing in Group A or B depends on it, and no repo document claims it.
3. **The cheap version has real teaching value**: one paragraph in Module 04 (which teaches scopes and audience restriction) noting that Authlete supports regex-matched dynamic scopes, that they are configured as a scope attribute, and that they cannot be advertised in `scopes_supported`.

Implementing it — configuring a `regex` scope, reading `dynamicScopes`, rendering the parameter on the consent
screen — is a plausible Module 04 or 09a exercise, but it competes with several higher-value items and should lose
that competition at Gate 4.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| No mention anywhere in `docs/`, `AGENTS.md` or the curriculum | — | Confirmed by grep | **`ABSENT`** / S4 — no incorrect claim exists |
| `00-inventory.md` §10 — "Group B; never mentioned in repo docs" | `00-inventory.md` | Accurate | **Accurate** |
| `docs/API.md`'s scope documentation makes no reference to dynamic scopes | `docs/API.md` | Correct for this deployment | **Accurate** |

Nothing here is wrong; the whole finding is an omission, which is why S4 is right despite the length of the entry.

## Sources consulted

- Authlete, Using Parameterized Scopes — `https://developers.authlete.com/configuration-reference/tokens-and-claims/using-parameterized-scopes.md`, fetched this session. Confirmed: the `regex` scope-attribute configuration, the `dynamicScopes` response array, the introspection path for resource servers, **the absence of any stated AS-side obligation**, and *"Only the scope name will be shown in a discovery document."*
- Live probe 2 (2026-08-10): `scopes_supported` — eight scopes, none parameterized — `SERVICE-CONFIG-PROBE.md` §6
- Code: grep for `dynamicScopes` — zero occurrences in `server/src` and `client/src`; `services/introspection.service.ts:27-31` (caller-supplied `scopes` forwarding); `views/consent.ejs`
- Cross-reference: `SCOPE-CLIENT-ATTRIBUTES.md` (the mechanism this feature is configured through)

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| PS-W1 | Add a paragraph to Module 04 and a `SPEC-INVENTORY.md` row | S | Row labelled **vendor feature, not a specification**. The paragraph names the `regex` scope attribute, the `dynamicScopes` response field, and the discovery limitation. |
| PS-W2 | Add "accepted but unadvertisable" to Module 09a's taxonomy | S | Alongside *"supported but not required"* and *"permitted but not configured"* at `modules/09a…/lab.md:120-124`, with the Authlete citation. |
| PS-W3 | Record the scope decision | S | Group B justification: no AS code required, no conformance weight, document-only. |
| PS-W4 | *(Not recommended)* Implement it | M | If ever done: configure a `regex` scope attribute, read `dynamicScopes`, and render the parameter value on the consent screen — otherwise the screen hides the distinguishing detail, per F-1. |

**Ordering.** All documentation. PS-W1 pairs naturally with `SCOPE-CLIENT-ATTRIBUTES.md`'s work items, since the
two features share a configuration mechanism.
