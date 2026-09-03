<!-- Loaded on demand, not by default. `AGENTS.md` is the obligation; this file is the explanation. -->

# Client SPA architecture

> **Read this when** you are changing anything under `client/src/`. The four debugging surfaces,
> the transport boundary, the session-key owner and the theme tokens each have a rule that a
> reasonable change would otherwise break.

## Client SPA architecture

- **Routing**: React Router v6 with lazy-loaded sections, map-based route resolution via `sectionComponents` record in `App.tsx`. Typed `Section` and `SectionGroup` interfaces.

  **`/` is a landing page, not a redirect, and there are two routes for it on purpose.** It was
  `<Navigate to="/auth-flows" replace />`, so first paint was a twenty-two-item sidebar and a form — the
  audit scored the on-ramp **1/5** and called it the widest competitive gap. `pages/LandingPage.tsx` now
  says what the tool is, reads the **live** configuration and marks what will fail, and offers one path
  in. `/` is preference-gated through `HomeRoute`; **`/start` always renders it**, so the opt-out is not
  a one-way door — somebody who ticked the box a month ago can still read the introduction and untick it
  there. A single gated `/` would have made the page unreachable to the only people likely to want it
  back, and a mutation confirmed no test noticed until one was written for it.

  **State below the section is addressable two ways, and which one depends on whether it is state.**
  `?op=` carries the selected tab in **ten** sections through `useUrlState` — Grant Flows was the last
  `TabBar` still holding its selection in `useState`, which mattered because it is the link people
  actually send each other. A **wizard step is a `#fragment`** instead: the FAPI and MCP wizards have no
  selected step to store, since they render every step at once and grey the ones whose prerequisite has
  not happened (`utils/step-state.ts`), which is right for teaching a protocol — you can read step 4
  before running step 1. `useHashScroll` resolves the fragment, moving **focus** as well as scrolling,
  because scrolling a sighted reader to step 4 and leaving the keyboard at the top of the document is the
  standard skip-link defect one layer along.
- **Sections**: 22 sections organized in 3 sidebar groups — OAuth 2.0 (Grant Flows, Token Operations, Step-Up Auth, Logout), OIDC & Extensions (DCR, CIBA, PAR, RAR, JAR, Device Flow, Backchannel Logout, Discovery, OIDC Federation, FAPI 2.0/DPoP, MCP, Verifiable Credentials), Admin (Token Management, Client Management, Grant Management, Health Check).
- **Layout**: three zones at `lg:` and up — **left navigates, centre acts, right is evidence**. A 48px
  header, a 224px navigation rail (`w-56`, desktop only, grouped, lucide icons, active-state shadows), the
  content pane, and the **evidence rail**. Collapsible mobile nav below `lg:`.

  **The shell is a shell only at `lg:`, and that is the fix for a defect that hid the vault** (2026-08-26).
  `AppLayout`'s root was `min-h-screen` — a *minimum* — while everything under it was written for a
  fixed-height shell: the row is `overflow-hidden`, `nav` and `main` are both `overflow-y-auto`. None of it
  engaged. Measured on `/auth-flows` at 1440×900: the document was **2,694px** tall, the `<aside>` was
  2,646px of it, and the Token Vault sat at **y = 2,637** — 1,737px below the fold on a rail that scrolled
  away with the page. Opening the vault's JWT inspector took the aside to ~8,700px and squeezed `nav` from
  2,575px to 992px, which is what "the sidebar looks missing" looks like. `min-h-screen lg:h-dvh` plus
  `min-h-0` on the row and on `nav`; constrained only at `lg:` because below it the sidebar is hidden and
  the reading surfaces are prose, which belongs in the document scroll a phone gives you for free.

  **`components/layout/EvidenceRail.tsx` is the third zone**, and it solves placement rather than adding
  features. The evidence this debugger captures was already good and was scattered across three unrelated
  idioms at three edges: tokens in the sidebar *footer* under 22 nav links in 224px, the request trace in a
  `position: fixed` drawer that **covered the content it explained** (`AppLayout` reserved
  `min(52vh, 30rem)` of bottom padding to compensate), and a decoded token wherever the producing section
  put it — nowhere at all for a token you brought with you. Three tabs: **Tokens** (the vault, expanded),
  **Trace** (`TracePanel variant="pane"`), **Inspect** (`JwsScratchpad`, which decodes and verifies any
  pasted JWS and normalises away the `Bearer` prefix, quotes and line wraps a real paste carries).

  Four rules it follows, each of which was a decision rather than a default:

  - **Open, tab and width persist in `localStorage`** through `services/preferences.ts`. `railOpen` stores
    both `'true'` and `'false'`, breaking that file's own remove-rather-than-write rule, because the
    default is not a constant — see the note on the key.
  - **It auto-opens from 1440px, derived not chosen.** `SplitPane` needs a 704px container; content pane =
    viewport − 224 − 380, container = min(1024, that) − 64, so two columns survive from **1372px** up. 1440
    is the first real display width above that bound, and a 1366×768 laptop correctly does not auto-open.
  - **The vault has exactly one home at a time** — the rail when open, the sidebar footer when shut. Both
    at once would be two instances with two expanded states and two Clear-session dialogs for one session;
    neither would make it reachable only to people who already know the rail exists.
  - **The trace is mounted once**, in the rail above `lg:` and as the bottom sheet below it, chosen through
    `hooks/useMediaQuery.ts` (`useSyncExternalStore`, `matchMedia`-guarded for jsdom). Rendering both and
    hiding one would put two `role="region"` landmarks with one accessible name in the tree.

  **`⌘K` / `Ctrl+K` is the way in, and `utils/command-index.ts` is what it searches.** The sidebar is the
  only route to a section and it does not fit: 22 links plus 4 group headings need 992px of a rail that
  has 781px, so Admin is permanently below the fold. One level down, `/reference` renders the whole cited
  corpus — 24 authorization parameters, 6 token-request parameters, 26 claims, 20 specification error
  codes, 18 Authlete codes, a glossary — each with its own anchor, and the only way to reach an entry was
  to know the page existed and scroll it. The corpus was the differentiator and its index was a scrollbar.

  The palette searches **the data, not the pages**: the index is built from the same modules
  `ReferencePage` renders, so nothing is authored twice and a renamed anchor breaks in one place. Four
  rules, each of which was a decision:

  - **`role="combobox"` with `aria-activedescendant`**, options not focusable, focus never leaving the
    input — the APG pattern. Move DOM focus onto each row instead and every keystroke after the first goes
    to a `<div>` rather than the query.
  - **The listbox is always mounted and the empty message is its sibling.** A `listbox` may contain only
    `option` and `group`, and `aria-controls` must point at a real element; those two rules pull opposite
    ways and this is the shape that satisfies both. Both are in the WCAG set axe runs.
  - **Groups are ordered by their best member**, not by a fixed category order, which is what keeps "type,
    then press Enter" true. A fixed order would put a weak Glossary hit above a strong Claims hit and
    Enter would open the wrong thing.
  - **No destructive commands.** Clearing the vault, revoking a token and deleting a client stay behind
    their typed confirmations. A palette is the one surface where you are typing fast at a list you have
    not finished reading.

  Matching is coarse on purpose — title beats keywords beats subtitle beats prose, every whitespace token
  must match something (AND, not OR), and a two-character query matches **initials**, so `cm` reaches
  *Client Management*. A relevance model nobody can predict is worse than a blunt one everybody can.

  **Writing the palette found a defect that had been there since `/reference` was written.** Its own doc
  comment claims *"every section deep-linkable by fragment"* and for **five of its six corpora that was
  false**: the tab lived in `useState`, so `/reference#claim-s_hash` rendered the Glossary tab, the element
  with that id was never in the DOM, and `useHashScroll` watched for it until its 5s deadline and gave up
  silently. Only `#glossary-*` worked, because glossary is the default. The tab is now `useUrlState('tab',
  …)` with **the incoming fragment as the fallback** — so `?tab=` stays addressable (UX-08) and a bare
  `/reference#claim-nonce` selects its own tab. The palette deliberately emits only the fragment: the
  prefix already implies the tab, and two encodings of one fact drift apart.

  **The trace toolbar reduces rather than discloses.** Nine controls in a 380px rail wrapped to three rows
  — a third of the pane's height spent on chrome before a single request appeared. The four file and
  clipboard actions now drop their labels to icons below `32rem` of *container* width, so one component is
  correct in the rail, in a rail dragged to 640px, and in the full-width bottom sheet. An overflow menu was
  the wrong tool: four one-click primitives, one of them **Clear**, and burying a destructive action a
  level deeper than the three benign buttons beside it is how it gets pressed by accident. The labels are
  `sr-only`, never `hidden` — `display: none` would take the text out of the accessibility tree and leave
  four icon buttons with no accessible name, and the fix for *that* is a second copy of every name in an
  `aria-label` free to drift from the one on screen.

  The sidebar footer is capped at `max-h-[50%]`: `nav` is `flex-1` so its flex base size is 0, which means
  a `shrink-0` footer wins every contest for height no matter how tall it gets. `JwtInspector` is a
  `@container` for the same class of reason — it renders at ~500–900px in a section pane and at 224px in
  the sidebar, and its fixed `min-w-[7rem]` claim column left **7–29px** for the value there, wrapping
  `nonce` over **38 lines**.
- **Components**: Organized into `components/layout/` (AppLayout, Sidebar, **EvidenceRail**, **CommandPalette**, SectionPanel, ErrorBoundary, AdminAuth), `components/auth/` — split on two different lines, and each line is the point. **Grant Flows splits by channel**: `AuthorizationCodePanel.tsx` is the front channel (a DPoP key, four `sessionStorage` keys `CallbackPage` will read, and a navigation), `BackChannelGrantPanels.tsx` is the four grants that are one `POST /api/token` each, `grant-flows.ts` is the tab and step configuration, `AuthFlowsSection.tsx` is what is genuinely shared — the diagram, the result pane, and the one place that records which client a token belongs to. Both panels are rendered **unconditionally** and return `null` when not selected, because conditional mounting would discard the other tab's state — including unticking DPoP while its key is still in session, which is the invisible-mode bug this section keeps producing. **The authorization-request builder splits by what owns which state**: `use-authorize-params.ts` is the parameter table and the one URL derived from it, `AuthorizeParamRow.tsx` is one row, `AuthorizeRequestPanel.tsx` owns raw-URL mode and therefore the send, `AuthorizeRequestBuilder.tsx` is the accordion and the wiring. Plus TokenRequestPanel, `components/oidc/` (8 OIDC/OAuth section components), `components/admin/` (4 admin section components; `ClientManagementSection` renders its seventeen operations from the `client-operations.ts` table rather than from seventeen branches), `components/fapi/` (FapiSection — the live posture report and the DPoP key tools; `use-fapi-flow.ts` owns the four-step sequence and `FapiTestFlow.tsx` renders it), `components/mcp/` (McpSection — three metadata lookups; `use-mcp-flow.ts` owns the six-step sequence and `McpWizard.tsx` renders it), `components/vci/` (VciSection plus one panel file per **authentication posture** — `VciDiscoveryPanels` public, `VciOfferPanels` admin-gated, `VciCredentialPanels` access-token — and `vci-operations.ts`), `components/trace/` (TracePanel, SequenceView), `components/ui/` (Button, Input, Select, Textarea, Badge, Card, TabBar, Spinner, Skeleton, FlowDiagram, SplitPane, RequestBuilder, TokenVault, JsonBlock, HelpPopover, OperationDescription, **JwtInspector**, **JwsScratchpad**, **ErrorExplainer**).

  **Four of these carry the debugging capability added 2026-08-21/22 and are worth knowing before adding a fifth surface.** `AuthorizeRequestBuilder` builds an authorization request from `data/authParams.ts` — 24 parameters, each with its conformance word and a spec reference verified against the primary source — and **the URL it displays is the string it navigates to**, because a separately-assembled preview drifted from the real request. That invariant now spans two files, which is why the split runs where it does: `builtUrl` is derived in `use-authorize-params.ts` and `effectiveUrl` — which is what actually gets sent — is decided in `AuthorizeRequestPanel.tsx` beside the raw-mode state it depends on. Computing the URL in one place and choosing which URL to send in another is precisely how the original preview drifted. `JwtInspector` decodes *and verifies* against the JWKS (`utils/jwt.ts`, `crypto.subtle`, RS/PS/ES); it starts **unverified** deliberately, since a legible payload is not an authenticated one. `ErrorExplainer` turns an OAuth error code or an Authlete `[Annnnnn]` into cause and fix via `data/errorDocs.ts` — and **never invents one**: the vendor half is generated from `docs/openapi-spec.json` and CI-gated, an unknown code is reported as unknown. `TracePanel`/`SequenceView` render the request trace as a timeline and as a message flow whose every arrow is a captured request.
- **Server status indicator**: `useServerStatus` hook (in `hooks/`) polls `GET /api/health` every 30s (10s retry on failure, 5s timeout). Color-coded badge in header: green=connected, red=offline, yellow pulse=checking. Hover shows uptime.
- **Hooks**: `useAsyncCall`, `useClipboard`, `useConfirmedAction`, `useCopyFeedback`, `useHashScroll`, `useMediaQuery`, `useServerStatus`, `useTheme`, `useTraces` and `useUrlState` in `hooks/` — ten, and **`useClipboard` is not dead despite reading like it**: `ui/TokenVault.tsx` is its one caller, which a truncated grep will miss. **`useMediaQuery` is for one narrow job and should not spread**: a Tailwind breakpoint belongs in the stylesheet and a container query usually beats a viewport one (`SplitPane`). It exists because the trace panel has to be *mounted in a different place* depending on the viewport, which CSS cannot express — and it uses `useSyncExternalStore` rather than `useState` + `useEffect`, both because a `MediaQueryList` is exactly an external mutable source and because a synchronous `setState` in an effect body is a cascading render that `react-hooks/set-state-in-effect` rejects. `useUrlState` carries three overloads so a caller supplying a real fallback is never handed `null` — without them every section with a default tab re-applied it beside a hook that had already been given it, and the second copy is the one that goes stale. Its `replace`-not-`push` choice is deliberate and documented in the file. `useServerStatus` re-runs its effect when connectivity flips — deliberately, since a connected server is polled every 30s and an unreachable one every 10s — so two requests on first connect is expected, not a duplicate.
- **Services**: Organized by domain in `services/` — `token.service.ts`, `admin.service.ts`, `client.service.ts`, `dcr.service.ts`, `ciba.service.ts`, `par.service.ts`, `rar.service.ts`, `device.service.ts`, `grant.service.ts`, `jar.service.ts`, `federation.service.ts`, `vci.service.ts`, `fapi.service.ts`, `backchannel-logout.service.ts`, `health.service.ts`, `mcp.service.ts`, `token-exchange.service.ts`, `client-assertion.service.ts`, `dpop.service.ts` and `announcer.ts`. All exported from `services/index.ts`. Beneath them sit `transport.ts` (the one place a request leaves), `http.ts` (request shapes over it), `schemas.ts` (what a response must look like), `run-file.ts` (a run as a file, exported and read back), `preferences.ts` (the `localStorage` counterpart to `session-keys.ts`), `dpop-fetch.ts`, `session-keys.ts`, `crypto-utils.ts` and `trace-store.ts` — **read the directory rather than trusting this list**, which is the kind of inventory that goes stale silently.

  **A one-line service is still load-bearing — do not inline it into its section.** `fapi.service.ts`,
  `federation.service.ts` and `backchannel-logout.service.ts` are little more than
  `http.postAdmin(CONSTANT, body, auth)`, and a complexity audit will keep proposing their removal.
  `scripts/check-client-server-contract.mjs` reads *this directory* to map every endpoint constant to
  the services that call it and to flag auth-gated routes whose callers mention no credential. A flow
  that talks to the server from a component instead is a flow that check cannot see — and it exists
  because four flows were dead for weeks with every gate green (2026-08-22). Saving 44 lines by
  blinding it is the wrong trade; ruled 2026-08-31.

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
  stays exported for the **inbound** hop, which `CallbackPage` records without navigating. **It also
  records where to come back to** (`SESSION_KEYS.returnTo`), for the same reason: it is the only place
  that knows. `/callback` renders outside `AppLayout`, so its one exit went to `/` — and since step 3 of
  the FAPI wizard comes *after* the redirect, the last step of that flow was unreachable in practice.
  An optional third argument lets a caller name the step to return *to* rather than the one it left
  from (`/fapi#fapi-step-3`); `CallbackPage` validates it is an internal path — a leading `/`, never
  `//` — before handing it to `navigate`.

  **The trace is persisted to `sessionStorage`, not held in memory.** Recording the outbound hop is not
  enough on its own: `window.location.href` discards the module holding the array, so the entry lived
  for microseconds and the callback page always opened on an empty history — `utils/diagnose.ts` printed
  "no evidence in this trace" for a flow that had run correctly. `sessionStorage`, **never
  `localStorage`**: one tab, dies with it, unreadable from another tab or a later visit, and the app
  already keeps the DPoP private key and the PKCE verifier there. Every mutation goes through
  `setEntries` — assign, persist, notify — because `recordTrace`, `clearTraces` and `importTraces` all
  write that array and "one caller was never told" is this file's recurring failure. `counter` is stored
  **with** the entries: restore rows without it and the next request re-mints `t1`.

  **`services/run-file.ts` is a run as data; the Markdown export is a run as prose. Both stay.**
  `TracePanel.toMarkdown` produces something you paste into a chat or an issue and **nothing could read it
  back**, so a run was shareable only as prose — the recipient saw the exchange and could not load it.
  Parsing the Markdown back would have been the wrong repair: a rendering is lossy on purpose, and a
  parser for it breaks every time the prose improves. Three rules decide the format. It is **redacted on
  export unconditionally**, through the same `redactHeaders`/`redactBody` the panel uses, because a file
  travels and there is no per-entry reveal decision left to honour — while response headers are
  deliberately *not* stripped, since `WWW-Authenticate` and `DPoP-Nonce` are the whole challenge
  mechanism and neither is a secret of the sender. It is **validated on import**, loose-never-strict like
  `schemas.ts`, because a file is untrusted input. And **an imported entry carries `imported: true` on
  the entry rather than in the panel's state** — a trace showing somebody else's requests as though they
  were yours is worse than no import at all, so the panel marks every row *and* shows a standing
  `role="status"` notice, and `importTraces` sets the flag itself rather than trusting what the file
  claimed. Import **replaces** rather than merges: interleaving two machines' requests by `startedAt`
  produces a timeline that never happened.

  **`preferences.ts` owns `localStorage`, and it is separate from `session-keys.ts` on purpose.** Same
  argument, different store — and the difference is the point: a `sessionStorage` preference resets when
  you close the tab, which makes it not a preference. Nothing sensitive goes in it, ever. Every read and
  write is wrapped, because `localStorage` *throws* rather than returning null in a private window and
  under some enterprise policies, and a preference is never worth a blank screen.

**`tokenService.userInfoForToken` and `introspectForToken` own the Bearer-vs-DPoP decision, and nothing else may.** It lived in
`TokenOpsSection` *and* in the FAPI wizard's step 3, and the copies diverged: one read the DPoP private
key from `sessionStorage`, the other from a `useState` that step 2's full-page redirect destroys. So the
wizard came back from the callback with step 3 **enabled** — it was gated on the token, which is
session-backed — and a proof factory that threw `TypeError: … reading 'privateKey'`. The crash sits
inside the factory, which a test mocking `userInfoWithDpop` never invokes, so the suite stayed green
(fixed 2026-09-02). A bound token has no bearer fallback (RFC 9449 §7.1/§7.2, Authlete `[A089311]`), so a
missing key is reported, never downgraded. `use-fapi-flow` restores both key pairs from the session on
mount for the same reason — gate each step on the field it is about to use, not on a neighbour.

**Introspection was left on the old side of that fix and had to be brought across (2026-09-03).**
Authlete's `/auth/introspection` is the *resource-server-facing* API: it decides whether a request
bearing the token is authorized, so for a sender-constrained token it checks the binding and refuses
without the proof — `401 [A065308]`, reported from the deployed client against the app's own FAPI 2.0
token. **The server was never the problem**: `introspection.service.ts` already forwards
`dpop`/`htm`/`htu`/`targetUri` whenever a `DPoP` header arrives, with `targetUri` from HTTP context so
a proof minted elsewhere cannot be replayed. Two details: the proof's `htm`/`htu` are *the
introspection endpoint's own*, because the server derives them from that request rather than from a
resource request; and `ath` **is** included here, unlike Grant Management, which omits it because its
request carries the token in the `Authorization` header — introspection's holds the admin credential
and the token is a body parameter, so `ath` is what ties proof to token. `Introspect (RFC 7662)`
checks no binding and remains the working path when the key is gone.

**`services/session-keys.ts` owns every `sessionStorage` key.** Thirteen were written from six components with no owner and `clearTokens()` removed three of them — so a signing key generated in the FAPI section survived, and the callback branches on its presence, silently switching every later code exchange to `private_key_jwt`. Read and write through this module; `resetSession()` enumerates the keys rather than repeating them. **One key is excluded from that sweep and it is not an oversight**: `traceHistory` is evidence, not credential state, and `resetSession` is what the vault's "Clear session" button calls — sweeping it would delete the request history as a side effect of clearing tokens, unmentioned in that dialog's list. The exclusion is the named `EVIDENCE_KEYS` list with a test on it, in both `session-keys.test.ts` and `TokenContext.test.tsx`.

  **`crypto-utils.ts` holds the one P-256 generator.** `kid` is derived from the exported JWK *before* `alg`/`use` are attached — folding the tags in first would silently change every signing key's `kid`. Pinned in `keygen-characterization.test.ts`, which was written against the duplicated version first.
- **Config**: `config.ts` reads `VITE_*` env vars at build time and exports `API_BASE_URL` plus the endpoint constants built from it; `PROD_CONFIG` + `getRedirectUri()` carry the one per-environment override that survives. Separate `HEALTH_ENDPOINT` for the live status polling. The dev server's own port lives in `vite.config.ts`, which reads `VITE_DEV_CLIENT_PORT` itself — `config.ts` used to export an unread second copy as `DEV_SERVER`.
- **Token storage**: `TokenContext` (React Context API) persists tokens in `sessionStorage`. TokenVault in sidebar displays/copies/inspects stored tokens. Cleared on explicit action or tab close. **It also exposes `isDpopBound`** (from `token_type`, compared case-insensitively per RFC 9110 §11.1), and every protected-resource call reads it: a sender-constrained token must be presented with the `DPoP` scheme and a proof, and Authlete refuses the bearer downgrade with `[A089311]` at UserInfo and `[A281305]` at `/gm`. Presenting `Bearer` unconditionally is what made the headline flow produce a token half the app could not use.
- **Management credentials**: `CredentialContext` holds one profile for the page. Eight sections used to hold their own `useState` pair, and a route change unmounts a section, so the same two values had to be retyped on every navigation. In memory only, deliberately — a React context lives exactly as long as the page, which is the right lifetime for something typed by hand.
- **Test framework**: Vitest, 81 files (1117 tests) — measured 2026-08-23. **Re-measure rather than carry these numbers forward — these were `41 files (420 tests)` for four months after they stopped being true.** Coverage thresholds are enforced as a *ratchet* set just under what the suite achieves, so they can only rise; `npm --prefix client run test:coverage` is the gate. There are **eight** floors: a global one plus `utils`, `services`, `hooks`, `context`, `data`, `pages` and `components`. Read the current numbers from `vitest.config.ts`; do not quote them from here.

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

  **Motion does work now, and there are exactly two animations that do it.** The audit's D8 finding was
  not that there is too little motion — it is that none of it did any: `FlowDiagram`'s circle already
  carried `transition-all duration-300` while a new response appeared instantly with nothing drawing the
  eye. `.animate-reveal` fires on a **changed response** and `.animate-step-in` on the **step that
  moved**, and both are keyed rather than classed — a CSS animation runs on mount, so a second run of the
  same operation would otherwise update text in place and animate nothing. `JsonBlock` keys on the
  serialised payload, so an *identical* response deliberately does not re-animate; `FlowDiagram` keys on
  `${step.id}-${state}`, so only the circle that changed replays. Both amplitudes are tiny — 4px of rise,
  6% of scale — and the `prefers-reduced-motion` block collapses them with a blanket `*` rule, so a
  keyframe added later is covered on arrival. `both` as the fill mode is what makes that collapse land on
  the finished state rather than flashing the start of one. `src/test/components/ui/motion.test.tsx`
  reads those guarantees out of the stylesheet, since jsdom runs no animations and Playwright disables
  them.

  ⚠️ **Still not looked at.** Contrast is measured and passing in both themes; nobody has opened the
  light theme in a browser. Layout, borders, translucent fills (`bg-indigo-500/10` on white) and focus
  rings are outside what a contrast check can see. Treat those as unverified.

  **Tailwind scans prose, so a utility name written in a comment ships its CSS rule** (found and fixed
  2026-09-02). Automatic source detection starts at the **git root**, so it was reading `docs/`, an
  archived audit and `DESIGN.md`, and compiling any class name it found in a sentence — including the
  sentences *forbidding* those classes. Four comments were live at once, one of them inside
  `ui/Checkbox.tsx`, the component written to abolish shade literals, and each shipped a rule no element
  used — removing one pair of them measured 316 bytes off the stylesheet. `globals.css` now pins the scan with `@import 'tailwindcss' source('..')`,
  which is exactly `client/src`. **This is why the literal three lines above is harmless and must not be
  "fixed"** — and why a new comment naming a real utility is still worth breaking into
  `bg-<hue>-500/10`, since the scope pin protects the repo's prose, not `client/src`'s own.

  The measurement that found it: grep the **built** stylesheet for shade-literal selectors. No source
  grep can see this class of defect, because the source is a comment.

**`e2e/a11y.spec.ts` is the accessibility gate, and it predates this branch.** It runs **axe-core** over
every surface in both palettes, plus the heading outline on every route, keyboard-only operation and both
live regions — in a real browser, over the browser's own accessibility tree. **A deliberate scope
decision (2026-08-23): a manual screen-reader script was written for this repo and then removed as
overkill for a teaching project.** Do not add one back without a reason; axe plus the existing keyboard
and live-region tests is the level this project is held to.

  **One lesson from that episode is worth keeping, because it is not about accessibility.** jsdom has no
  accessibility tree, and the gap cuts both ways. `getByRole` computes roles from the DOM by Testing
  Library's own mapping — which catches a missing `role` and is blind to what broke `FlowDiagram`, a
  `role="list"` whose `<div>` children the *browser* discarded. And `useHashScroll` passed **six** jsdom
  tests while not working in a browser at all: sections arrive through `React.lazy`, so its one-shot
  lookup ran before the chunk resolved and never looked again. A jsdom fixture renders its target
  synchronously in the same tree, so the lookup always hit. One Playwright assertion failed immediately.
  **A feature whose only tests are jsdom tests is a feature nobody has seen work** — which is the
  argument for `e2e/` in general, and the reason the fragment-focus test in `a11y.spec.ts` was kept when
  the rest of that block was deleted.

### Three client checks, and what each cannot see

```bash
node scripts/check-theme-tokens.mjs    # every semantic utility is mapped; both palettes define the same tokens
node scripts/extract-authlete-codes.mjs --check   # the generated vendor code table still matches docs/openapi-spec.json
node scripts/check-client-docs.mjs     # every getDoc key exists, every entry is reachable, README covers every section
node scripts/check-contrast.mjs        # WCAG AA in BOTH themes, from the built stylesheet's real values
```

All three run on every push. They exist because **every defect found in the 2026-08-21 client review was invisible to typecheck, lint, tests and build** — those four cannot see a class that does not exist, a screen that never renders, a doc entry nobody asks for, or a vendor table drifting from its source. The Authlete one is worth one further note: of the 38 result codes the vendor documents and the 27 this repo established by probing (both re-measured 2026-08-23; this line said 25), **the overlap is zero** — a decoder built from the vendor document alone would explain nothing a developer actually hits.
