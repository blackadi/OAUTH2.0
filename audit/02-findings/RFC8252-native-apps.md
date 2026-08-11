# RFC 8252 — OAuth 2.0 for Native Apps (BCP 212)

- **Verdict:** `IMPLEMENTED_VERIFIED`
- **Severity:** S4
- **Authlete version:** 3.0 — **no dedicated Authlete page**; the only vendor surface is one flag
- **Repo docs under test:** `SPEC-INVENTORY.md:93`, `docs/DEVELOPMENT.md`, `modules/03-pkce-and-public-clients/`

<thinking>
1. RFC 8252 is a BCP addressed almost entirely to **native app clients**, not to authorization servers:
   use an external user-agent, not an embedded webview; choose among private-use URI scheme, claimed
   `https`, or loopback redirect. The single obligation it places on the AS is §7.3: for loopback
   redirects the AS should treat the **port as variable**, because the app cannot reserve a port in
   advance.
2. Authlete boundary: that obligation maps to exactly one flag, `Service.loopbackRedirectionUriVariable`.
   Everything else in RFC 8252 is unenforceable by an AS and untestable here — this repo has no native
   app.
3. Code: nothing in `server/src` reads the flag; it is service configuration only. Correct.
4. Live probe: `loopbackRedirectionUriVariable = True`.
5. Delta: none. The one AS-side requirement is satisfied on the live service, and the flag value matches
   `AGENTS.md`'s recommendation.
6. Unsure: nothing. This is the shortest honest entry in the audit, and the verdict is short because the
   spec's AS-side surface is genuinely one boolean — not because the audit was shallow.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Treat the port as variable when matching loopback redirection URIs | §7.3 | ✅ **Verified live** — `loopbackRedirectionUriVariable = True` |
| 2 | Use an external user-agent; never an embedded webview | §4, §8.12 | ⊘ Binds the **client**. No native app in this repo. Taught in Module 03. |
| 3 | Choose among private-use scheme / claimed `https` / loopback | §7 | ⊘ Binds the client |
| 4 | PKCE for public clients | §8.1, and RFC 9700 §2.1.1 | ⚠️ **Not required on this service** — `pkceRequired = False`. See `RFC7636-pkce.md` (`MISCONFIGURED`/S1) |

Requirement 4 is RFC 8252's practical dependency rather than its own normative text, so it does not change
this verdict — but a native-app deployment reading RFC 8252 as satisfied here would inherit the PKCE
problem. Cross-referenced rather than double-counted.

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Variable-port loopback matching | Authlete, via configuration | `Service.loopbackRedirectionUriVariable` — live value `True` |
| Exact matching otherwise | Authlete | RFC 9700 §2.1 requirement; see `RFC9700-security-bcp.md` |
| External-user-agent behaviour | The native app | not applicable here |

`llms.txt` has **no page** for RFC 8252. The flag is documented on the flags page, which describes it as
*"Treats port number as variable for loopback IP redirection URIs per RFC 8252"* — matching §7.3.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| RFC 8252 status "Published RFC (**BCP 212**)", Oct 2017 | `SPEC-INVENTORY.md:93` | Correct | **Accurate** |
| "Where in this repo: `loopbackRedirectionUriVariable` flag (`AGENTS.md`); Module 03" | `SPEC-INVENTORY.md:93` | Exactly right, and honest that there is no code | **Accurate** |
| `loopbackRedirectionUriVariable` recommended `true` | `AGENTS.md` flags table | Live value **is** `True` | **Accurate and satisfied** |
| Module 03 teaches the three redirect strategies and why embedded webviews are forbidden | `modules/03…/README.md:59-76` | Matches §7 and §8.12 | **Accurate** |

## Sources consulted

- RFC 8252 §7.3 (variable loopback port), §4/§7/§8.12 (client obligations) — carried from `SPEC-INVENTORY.md:93` and corroborated by Authlete's flags-page description. **RFC 8252 text not fetched directly this session** — see source gap
- Authlete flags page — `https://developers.authlete.com/configuration-reference/error-handling-debugging/flags-supported-in-authlete.md`
- `llms.txt` — confirmed no RFC 8252 page
- Live probe: `loopbackRedirectionUriVariable = True` (`SERVICE-CONFIG-PROBE.md`)

## Source gap — stated rather than papered over

**RFC 8252's own text was not fetched in this session.** The §7.3 requirement is carried from
`SPEC-INVENTORY.md:93` (verified 2026-08-02) and corroborated by Authlete's flags-page wording, which
cites RFC 8252 for exactly this behaviour. Two independent secondary sources agree, and the live flag
value is observed, so the verdict is well-founded — but by this audit's own rule the primary source should
be read before the finding is final.

`IMPLEMENTED_VERIFIED` is justified on the strength of the observed flag value plus two corroborating
sources. If the Phase 3 pass cannot fetch RFC 8252, this entry should be downgraded to
`IMPLEMENTED_UNVERIFIED` rather than left as is.

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 8252-W1 | Fetch RFC 8252 §7.3 and confirm the requirement wording | S | Either this entry is confirmed, or the verdict is corrected |
| — | No code or configuration change | — | The one AS-side requirement is already satisfied. Recording that is the finding. |
