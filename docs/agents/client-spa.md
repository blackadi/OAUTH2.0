<!-- Loaded on demand, not by default. `AGENTS.md` is the obligation; this file is the explanation. -->

# Client SPA architecture

> **Read this when** you are changing anything under `client/src/`. The four debugging surfaces,
> the transport boundary, the session-key owner and the theme tokens each have a rule that a
> reasonable change would otherwise break.

## Client SPA architecture

- **Routing**: React Router v6 with lazy-loaded sections, map-based route resolution via `sectionComponents` record in `App.tsx`. Typed `Section` and `SectionGroup` interfaces.
- **Sections**: 22 sections organized in 3 sidebar groups — OAuth 2.0 (Grant Flows, Token Operations, Step-Up Auth, Logout), OIDC & Extensions (DCR, CIBA, PAR, RAR, JAR, Device Flow, Backchannel Logout, Discovery, OIDC Federation, FAPI 2.0/DPoP, MCP, Verifiable Credentials), Admin (Token Management, Client Management, Grant Management, Health Check).
- **Layout**: Sticky 48px header with AppLayout, collapsible mobile nav, 56px sidebar (desktop only). Backdrop blur on header. Grouped sidebar with lucide icons and active-state shadows.
- **Components**: Organized into `components/layout/` (AppLayout, Sidebar, SectionPanel, ErrorBoundary, AdminAuth), `components/auth/` (AuthFlowsSection, AuthorizeRequestBuilder), `components/oidc/` (8 OIDC/OAuth section components), `components/admin/` (4 admin section components; `ClientManagementSection` renders its seventeen operations from the `client-operations.ts` table rather than from seventeen branches), `components/fapi/` (FapiSection — the live posture report and the DPoP key tools; `use-fapi-flow.ts` owns the four-step sequence and `FapiTestFlow.tsx` renders it), `components/mcp/` (McpSection — three metadata lookups; `use-mcp-flow.ts` owns the six-step sequence and `McpWizard.tsx` renders it), `components/vci/` (VciSection plus one panel file per **authentication posture** — `VciDiscoveryPanels` public, `VciOfferPanels` admin-gated, `VciCredentialPanels` access-token — and `vci-operations.ts`), `components/trace/` (TracePanel, SequenceView), `components/ui/` (Button, Input, Select, Textarea, Badge, Card, TabBar, Spinner, Skeleton, FlowDiagram, SplitPane, RequestBuilder, TokenVault, JsonBlock, HelpPopover, OperationDescription, **JwtInspector**, **ErrorExplainer**).

  **Four of these carry the debugging capability added 2026-08-21/22 and are worth knowing before adding a fifth surface.** `AuthorizeRequestBuilder` builds an authorization request from `data/authParams.ts` — 24 parameters, each with its conformance word and a spec reference verified against the primary source — and **the URL it displays is the string it navigates to**, because a separately-assembled preview drifted from the real request. `JwtInspector` decodes *and verifies* against the JWKS (`utils/jwt.ts`, `crypto.subtle`, RS/PS/ES); it starts **unverified** deliberately, since a legible payload is not an authenticated one. `ErrorExplainer` turns an OAuth error code or an Authlete `[Annnnnn]` into cause and fix via `data/errorDocs.ts` — and **never invents one**: the vendor half is generated from `docs/openapi-spec.json` and CI-gated, an unknown code is reported as unknown. `TracePanel`/`SequenceView` render the request trace as a timeline and as a message flow whose every arrow is a captured request.
- **Server status indicator**: `useServerStatus` hook (in `hooks/`) polls `GET /api/health` every 30s (10s retry on failure, 5s timeout). Color-coded badge in header: green=connected, red=offline, yellow pulse=checking. Hover shows uptime.
- **Hooks**: `useAsyncCall`, `useClipboard`, `useServerStatus`, `useTraces`, `useTheme` in `hooks/`. `useServerStatus` re-runs its effect when connectivity flips — deliberately, since a connected server is polled every 30s and an unreachable one every 10s — so two requests on first connect is expected, not a duplicate.
- **Services**: Organized by domain in `services/` — `token.service.ts`, `admin.service.ts`, `client.service.ts`, `dcr.service.ts`, `ciba.service.ts`, `par.service.ts`, `rar.service.ts`, `device.service.ts`, `grant.service.ts`, `jar.service.ts`, `federation.service.ts`, `vci.service.ts`, `fapi.service.ts`, `backchannel-logout.service.ts`, `health.service.ts`, `mcp.service.ts`, `token-exchange.service.ts`, `client-assertion.service.ts`, `dpop.service.ts` and `announcer.ts`. All exported from `services/index.ts`. Beneath them sit `transport.ts` (the one place a request leaves), `http.ts` (request shapes over it), `schemas.ts` (what a response must look like), `dpop-fetch.ts`, `session-keys.ts`, `crypto-utils.ts` and `trace-store.ts` — **read the directory rather than trusting this list**, which is the kind of inventory that goes stale silently.

  **`services/transport.ts` is the only place a request leaves the app, and nothing should bypass it.** `http.ts` is now request *shapes* over it. Every service ended with `throw new Error(await response.text())` until 2026-08-21 — nine times in `http.ts` and again in six other files — which discarded the status, the status text and every response header at the boundary, so nothing downstream could tell 400 from 401 from 429 from 500. `WWW-Authenticate` carries the whole step-up and DPoP challenge mechanism, `DPoP-Nonce` carries the value a client must replay, and `Retry-After` distinguishes a rate limit from a rejection; all three were invisible. `sendRaw` deliberately does **not** throw on a non-2xx — at a debugger's transport layer a 401 is data — and `send` wraps it for callers that want the throw. `HttpError.message` is the raw body, which is what let ~20 `toast.error(err)` call sites keep working. Every call is recorded to `services/trace-store.ts`, which the trace panel and the flow diagram both read.

  **The server changed and one caller was never told — four times, in four sections** (2026-08-22, found by auditing outward from the `[A157303]` fix). Each was a server-side decision that landed in the docs and never in the SPA, so the section was dead or inert while every gate stayed green:

  | Section | Was | Cause |
  |---|---|---|
  | **JAR** | **401 for every user** | `requireBasicAuth("jar")` added 2026-08-13 (the response used to leak a `ticket`). `jar.service.ts` called `http.postJson`, and `JarSection` had no credential field. **Module 05's lab had authenticated its `curl` since the day of the change** |
  | **FAPI 2.0 wizard**, step 3→4 | enabled button, **did nothing** | T1-11 made `/api/par` answer RFC 9126 §2.2's body; the wizard read `requestUri` and returned early on `undefined`, while the panel above displayed the `request_uri` it refused to use |
  | **MCP wizard**, step 4 | exchange with **no client auth** | registered `CLIENT_SECRET_BASIC`, read the `client_secret` into a local used only in a toast, never stored it |
  | **Admin → local token** | 401 in dev | `checkAuth` added to `GET /api/token/createLocalToken`; `adminService.localToken` was the one admin call passing no `auth`, and **its test asserted the header was absent** |

  Four lessons, in descending order of how easily each recurs:

  - **An auth gate added on the server is a client change too, and the documentation being right is not the client being right.** Three of the four are this. `check-route-coverage.mjs` asks "does a test name this route?" on the server side; nothing asks it of the SPA.
  - **A local `as { … }` cast defeats a shared response type.** `ParSuccessResponse` exists in `par.service.ts` precisely so T1-11's rename is a compile error — `RarSection` had this same bug and was fixed — and `FapiSection` declared its own inline shape and cast to it. Consume the shared type; do not restate it.
  - **Gate a step on the field you are about to use**, not on the response object being truthy. `!wizParResult` enabled a step whose handler then returned on `!wizParResult.request_uri`: an enabled control that does nothing is worse than a disabled one, because there is nothing to read.
  - **A test can pin a missing header as firmly as a present one.** The `localToken` test asserted `headers: { Accept }` exactly, so the absent credential was locked in by the suite.

  Also from the same sweep: `clientCredentials`, `passwordGrant` and `refreshToken` sent `Authorization: Basic` **unconditionally** — so **Refresh Token failed with `[A157303]` for the same reason the code exchange did** (probed live). They now share `postWithOptionalBasic`, matching what `jwtBearerGrant`, `revocation` and `device.service.pollToken` always did, and `AuthFlowsSection`'s `requestPreview` moved with them because **the preview is the request**. Two invisible modes were made visible rather than merely resettable: a stored FAPI signing key now warns in Grant Flows that the exchange will use `private_key_jwt` (it silently rewired the flow, `[A157303]` again), and a DPoP-bound token with no key in session refuses locally instead of sending a `Bearer` request Authlete must reject with `[A089311]`.

  **What was checked and found clean**, so a future sweep need not redo it: all **62** client endpoint constants resolve to mounted routes; every admin-gated server controller was cross-checked against its client caller; PAR, RAR, Device, CIBA, DCR, Backchannel Logout, Discovery, Federation, Grant Management, Client Management, Token Management, Step-Up, Health, Logout and VCI all present credentials and read response fields correctly. **No component test covers the FAPI or MCP wizards** — the guards there are the compiler and the service tests, which is worth knowing before trusting a green suite about them.

  **`services/schemas.ts` declares what a response must look like, and `send` enforces it.** `zod@4.4.3`
  was a dependency imported from nowhere until 2026-08-23. Eight shapes are now written down — token
  (RFC 6749 §5.1), PAR (RFC 9126 §2.2), device authorization (RFC 8628 §3.2), DCR (RFC 7591 §3.2.1), AS
  metadata (RFC 8414 §2), introspection (RFC 7662 §2.2) and this deployment's two health bodies — with
  **every conformance word read from the RFC rather than recalled**, and the one specification that
  attaches no conformance word at all (RFC 9126 §2.2) says so instead of being given a plausible one.
  Three rules decide the design:

  - **Loose, never strict.** RFC 6749 §5.1 permits parameters beyond the five it defines and Authlete
    sends them; a strict schema would reject `grant_id`, `authorization_details` and every vendor field,
    turning a correct server into a broken one.
  - **Success-only.** `send` validates, `sendRaw` never does — at that layer a non-2xx is *data*, and a
    CIBA poll's `authorization_pending` or a DPoP `use_dpop_nonce` are the normal states of their flows.
    Validating an error body against a success schema would report "access_token is missing" for a
    response whose actual problem is `invalid_client`.
  - **`SchemaError.message` carries the raw body**, like `HttpError`'s does. A debugger that says "the
    response was wrong" without showing the response has removed the only thing worth looking at.

  **`zod/mini`, not `zod`** — measured, not assumed: 120.4 kB gzip against 133.7 kB, for
  **byte-identical** issue messages. The only difference is a functional API (`z.optional(z.number())`).

  **What it found on its first run is the point.** Three service-test fixtures were still describing the
  camelCase envelope T1-11 replaced in August — `par` mocked `requestUri`, `device` mocked
  `deviceCode`/`userCode`, `dcr` mocked `clientId` — and two of them **asserted that shape as the
  expected return value**. Nothing noticed, because those tests check the outgoing request and never
  read the response. A fixture is documentation of what the server sends; a wrong one teaches the next
  reader the wrong shape and is the only thing standing between a schema and a false pass.

  **`utils/parse-json.ts` is not superseded by this and should not be deleted.** Its four uses are
  user-typed JSON in a textarea, an *error* string (which validation deliberately never sees), a vendor
  `responseContent` string nested inside a body, and `sessionStorage` — none of them at the transport
  boundary.

**`navigateTo` in `services/trace-store.ts` is the only way the browser should leave this app.** The
  back channel has had a chokepoint since the transport rewrite — every request goes through
  `transport.ts`, so nothing can be sent without reaching the trace. The **front** channel had none:
  `window.location.href = url` appeared in **seven places across five sections** and only *one*, Grant
  Flows, called `recordNavigation` beside it. So the authorization hop was in the trace when the flow
  started from Grant Flows and **invisible** when it started from PAR, RAR, the FAPI wizard or Logout,
  and `hasAuthorizeRequest` (`utils/flow-progress.ts`) was true or false depending on which section you
  had used. Nothing could see it: a navigation leaves no artefact to assert against, which is precisely
  why `recordNavigation` was written in the first place — and then wired into one caller. Pairing the
  record with the navigation in one function is what makes forgetting impossible. `recordNavigation`
  stays exported for the **inbound** hop, which `CallbackPage` records without navigating.

  **`services/session-keys.ts` owns every `sessionStorage` key.** Thirteen were written from six components with no owner and `clearTokens()` removed three of them — so a signing key generated in the FAPI section survived, and the callback branches on its presence, silently switching every later code exchange to `private_key_jwt`. Read and write through this module; `resetSession()` enumerates the keys rather than repeating them.

  **`crypto-utils.ts` holds the one P-256 generator.** `kid` is derived from the exported JWK *before* `alg`/`use` are attached — folding the tags in first would silently change every signing key's `kid`. Pinned in `keygen-characterization.test.ts`, which was written against the duplicated version first.
- **Config**: `config.ts` reads `VITE_*` env vars at build time, provides per-environment overrides via `PROD_CONFIG` + `getApiBaseUrl()`/`getRedirectUri()`. Separate `HEALTH_ENDPOINT` for the live status polling.
- **Token storage**: `TokenContext` (React Context API) persists tokens in `sessionStorage`. TokenVault in sidebar displays/copies/inspects stored tokens. Cleared on explicit action or tab close. **It also exposes `isDpopBound`** (from `token_type`, compared case-insensitively per RFC 9110 §11.1), and every protected-resource call reads it: a sender-constrained token must be presented with the `DPoP` scheme and a proof, and Authlete refuses the bearer downgrade with `[A089311]` at UserInfo and `[A281305]` at `/gm`. Presenting `Bearer` unconditionally is what made the headline flow produce a token half the app could not use.
- **Management credentials**: `CredentialContext` holds one profile for the page. Eight sections used to hold their own `useState` pair, and a route change unmounts a section, so the same two values had to be retyped on every navigation. In memory only, deliberately — a React context lives exactly as long as the page, which is the right lifetime for something typed by hand.
- **Test framework**: Vitest, 77 files (1037 tests). **Re-measure rather than carry these numbers forward — these were `41 files (420 tests)` for four months after they stopped being true.** Coverage thresholds are enforced as a *ratchet* set just under what the suite achieves, so they can only rise; `npm --prefix client run test:coverage` is the gate. There are **eight** floors: a global one plus `utils`, `services`, `hooks`, `context`, `data`, `pages` and `components`. Read the current numbers from `vitest.config.ts`; do not quote them from here.

  **Three layers, and each sees what the one below cannot.** `sections.smoke.test.tsx` renders all 22 sections and `App.routes.test.tsx` drives the real router at all 22 routes — but both measure *reachability*, a section that mounts and offers an enabled control, which is blind to a control that looks fine and does the wrong thing. Every section therefore also has a **driven** test in `src/test/components/sections/*.driven.test.tsx` that presses the control and asserts what reached the service; see the header of `src/test/helpers/drive-section.tsx` for the layer boundary and the four dead flows that motivated it. Below both, `services/schemas.ts` validates response *shape* at the transport boundary, which is the only one of the three that catches a rename for every caller at once.
- **Styling**: Tailwind CSS v4 via `styles/globals.css`. **Utilities come from `@theme`, not from `:root`** — declaring the values on `:root` alone generates nothing, which is how ~160 usages of `bg-card`, `border-border`, `text-muted-foreground` and friends compiled to nothing across 28 files while every gate stayed green. Two complete palettes, dark-first: `:root` is dark, a media query serves a system light preference, and `[data-theme]` lets the header toggle win in both directions. Inter + JetBrains Mono, custom scrollbar, grid background utility.

  **Accent colours are semantic tokens, not shades, and that is not cosmetic.** `text-accent-text`,
  `text-success-text`, `text-warning-text`, `text-danger-text` and `text-info-text` each carry a
  per-theme value. The literals they replaced — `text-indigo-300`, `text-amber-300` and 149 others —
  were chosen against a near-black ground and inherited unchanged when the light palette arrived, so
  **25 of 26 failed WCAG AA against every light surface**, `text-amber-200` at 1.25:1. Nothing could
  see that: a colour which fails contrast is still a perfectly valid colour, and every other gate was
  green. `scripts/check-contrast.mjs` now scores both themes from the real oklch values in the built
  stylesheet, and runs on every push. Shade nuance was deliberately collapsed into one token per role —
  no single shade can encode emphasis on both a `#020617` and a `#ffffff` ground.

  ⚠️ **Still not looked at.** Contrast is measured and passing in both themes; nobody has opened the
  light theme in a browser. Layout, borders, translucent fills (`bg-indigo-500/10` on white) and focus
  rings are outside what a contrast check can see. Treat those as unverified.

### Three client checks, and what each cannot see

```bash
node scripts/check-theme-tokens.mjs    # every semantic utility is mapped; both palettes define the same tokens
node scripts/extract-authlete-codes.mjs --check   # the generated vendor code table still matches docs/openapi-spec.json
node scripts/check-client-docs.mjs     # every getDoc key exists, every entry is reachable, README covers every section
node scripts/check-contrast.mjs        # WCAG AA in BOTH themes, from the built stylesheet's real values
```

All three run on every push. They exist because **every defect found in the 2026-08-21 client review was invisible to typecheck, lint, tests and build** — those four cannot see a class that does not exist, a screen that never renders, a doc entry nobody asks for, or a vendor table drifting from its source. The Authlete one is worth one further note: of the 38 result codes the vendor documents and the 25 this repo established by probing, **the overlap is zero** — a decoder built from the vendor document alone would explain nothing a developer actually hits.
