import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, vi, type MockInstance } from 'vitest';
import type { ReactElement } from 'react';
import { TokenProvider } from '@/context/TokenContext';
import { CredentialProvider } from '@/context/CredentialContext';

/**
 * Drive a section the way a user does, and assert what actually went out.
 *
 * **Why this exists, precisely.** `sections.smoke.test.tsx` asserts that a section mounts and offers an
 * enabled control. That is a smoke detector, and it says so. It cannot see any of the four dead flows the
 * 2026-08-22 sweep found — every one of which was a *control that looked fine and did the wrong thing*:
 *
 * | What broke | Why a smoke test missed it |
 * |---|---|
 * | **JAR**: server added `requireBasicAuth`, the client sent no credential | the button was enabled and the request went out — just unauthenticated |
 * | **FAPI step 3→4**: read `requestUri`, the server sends `request_uri` | the control was enabled and its handler returned early on `undefined` |
 * | **MCP step 4**: the secret was read into a local used only in a toast | the exchange happened, without client authentication |
 * | **Admin local token**: `checkAuth` added server-side | and its test asserted `headers: { Accept }` **exactly**, pinning the missing credential |
 *
 * So a driven test has to answer three questions a render cannot:
 *
 * 1. **Does the control fire the call at all?** (`expectCall`)
 * 2. **Does the call carry what the server requires?** (`sends`) — the JAR and MCP classes.
 * 3. **Does the section read the response field the server actually sends?** (`readsBack`) — the FAPI
 *    class, and the only one of the four that a request assertion alone cannot catch.
 *
 * **One rule from the fourth class, and it shapes every helper here: never assert an exact argument
 * object.** The Admin test asserted the full options bag, so the *absence* of the auth header was locked
 * in by the suite. `sends` therefore checks that required things are **present**, never that nothing else
 * is. A test that pins absence is worse than no test.
 *
 * ## What this layer does **not** cover, and where that half lives
 *
 * These tests spy on the **service method**, so they verify *section → service*: did the component pass
 * the credential it collected? They cannot see inside the service, and that boundary was measured rather
 * than assumed — reintroducing the defect inside `processJar` leaves all four JAR tests green, while
 * removing the argument at the call site fails one immediately with the encoded credential named.
 *
 * The other half — *service → wire* — belongs to the service unit tests, which mock `fetch` and assert
 * the actual `Authorization` header. `jar.service.test.ts` does exactly that, and it exists because the
 * JAR outage had **both** halves broken at once: the service called `http.postJson` with no auth *and*
 * the section had no credential field. Two layers, two suites, and neither is sufficient alone. If you
 * add a section test here, check the matching service test asserts the header — otherwise the pair has a
 * hole precisely where this repo has already been bitten.
 */

/** Mount a section inside the providers every one of them needs. */
export function mountSection(ui: ReactElement): RenderResult {
  return render(
    <MemoryRouter>
      <TokenProvider>
        <CredentialProvider>{ui}</CredentialProvider>
      </TokenProvider>
    </MemoryRouter>,
  );
}

/**
 * Seed a token set before mounting, for the sections that need one.
 *
 * Written straight to `sessionStorage` because that is where `TokenProvider` reads its initial value —
 * going through the context would need a component, and this has to happen before the first render.
 */
export function seedTokens(tokens: Record<string, unknown> = {}): void {
  sessionStorage.setItem(
    'token_response',
    JSON.stringify({ access_token: 'at-seeded', token_type: 'Bearer', ...tokens }),
  );
}

/** Seed a DPoP key pair, for the sections whose sender-constrained path branches on its presence. */
export function seedDpopKey(): void {
  sessionStorage.setItem(
    'dpop_private_key',
    JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' }),
  );
  sessionStorage.setItem('dpop_kid', 'seeded-kid');
}

/** Select a tab by its visible label, for the sections whose operations are tabs. */
export async function selectOp(label: string | RegExp): Promise<void> {
  const tab = screen.getByRole('tab', { name: label });
  fireEvent.click(tab);
  await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'));
}

/**
 * Type into a labelled field.
 *
 * By label, not by placeholder or test id: a control the user cannot identify by its label is a defect in
 * its own right, so a test that can only find it another way is hiding one.
 *
 * **Anchor your regexes.** A loose `/Client ID/i` matches both "Client ID" and "Admin Client ID", and
 * Testing Library then throws "found multiple" — which is the good outcome. The bad one is a section where
 * only one of the two exists and the test silently fills the wrong field, so prefer `/^Client ID$/i` or a
 * plain string, and let the ambiguity be an error rather than a coin flip.
 */
export function fill(label: string | RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Fill several fields at once. */
export function fillAll(values: Array<[string | RegExp, string]>): void {
  for (const [label, value] of values) fill(label, value);
}

/**
 * Enter the management credentials the admin-gated sections require.
 *
 * `label` mirrors `AdminAuth`'s own prop: a caller that passes one gets `"<label> Client ID"` instead
 * of `"Admin Client ID"`, and `McpSection` passes `"Admin (for DCR)"`. The regex is anchored at both
 * ends because the unanchored form matches `"Registered Client ID"` and `"Client ID (auto-filled)"` in
 * the same section — Testing Library then throws "found multiple", which is the *good* outcome; the bad
 * one is a section where only the wrong field exists and the credential is typed into it silently.
 */
export function fillAdminCredentials(
  id = 'mgmt-id',
  secret = 'mgmt-secret',
  label = 'Admin',
): void {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  fill(new RegExp(`^${escaped} Client ID$`, 'i'), id);
  fill(new RegExp(`^${escaped} Client Secret$`, 'i'), secret);
}

/** Click a button by its accessible name, failing loudly if it is disabled. */
export function press(name: string | RegExp): void {
  const button = screen.getByRole('button', { name });
  expect(button, `"${String(name)}" is disabled, so it cannot fire a request`).toBeEnabled();
  fireEvent.click(button);
}

/**
 * Confirm a `ConfirmDialog`, typing the required value when one is demanded.
 *
 * The four irreversible actions are behind a typed confirmation, so a driven test of those has to pass
 * through it — and asserting that it *appears* is itself worth having, since the guard is the finding.
 */
export async function confirmDialog(typed?: string): Promise<void> {
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toBeInTheDocument();
  if (typed !== undefined) {
    fireEvent.change(within(dialog).getByLabelText(/to confirm/i), { target: { value: typed } });
  }
  /**
   * Scoped to the dialog, which is not a detail.
   *
   * Searching the whole document found `GrantManagementSection`'s **own** "Revoke" button first — the
   * dialog is rendered after it in DOM order — so the test re-opened the confirmation instead of
   * confirming it, and reported that the service was never called. The guard being tested is *"the
   * destructive button is not the one that acts"*, so a helper that can pick up the guarded button is
   * looking in exactly the wrong place.
   */
  const confirm = within(dialog)
    .getAllByRole('button')
    .find((b) => b.textContent && /^(Delete|Revoke|Deregister|Clear)/i.test(b.textContent));
  expect(confirm, 'no confirm button in the dialog').toBeDefined();
  expect(
    confirm,
    'the confirm button is still disabled — was the typed value wrong?',
  ).toBeEnabled();
  fireEvent.click(confirm!);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- a spy over an arbitrary service method cannot be
   typed more precisely than this without naming every service signature here; each call site is typed by
   `vi.spyOn` at the point of use, which is where it matters. */
type AnySpy = MockInstance<(...args: any[]) => any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Await a spy being called, with a message that says which control failed to fire. */
export async function expectCall(spy: AnySpy, what: string): Promise<unknown[]> {
  await waitFor(() => expect(spy, `${what} did not reach its service`).toHaveBeenCalled());
  return spy.mock.calls[0] as unknown[];
}

/**
 * Assert that a value appears **somewhere** in a call's arguments, at any depth.
 *
 * Searching rather than indexing is deliberate. Services here take credentials in four different shapes
 * — a positional `auth` string, a `clientId`/`clientSecret` pair, a body object, a `URLSearchParams` —
 * and a helper that demanded one shape would either need a per-service variant or tempt the test into
 * asserting the whole argument list, which is the mistake the Admin test made.
 */
export function callCarries(args: unknown[], needle: string): boolean {
  const seen = new Set<unknown>();
  const walk = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.includes(needle);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value) === needle;
    if (value instanceof URLSearchParams) return value.toString().includes(needle);
    if (typeof value === 'object') {
      if (seen.has(value)) return false;
      seen.add(value);
      return Object.values(value as Record<string, unknown>).some(walk);
    }
    return false;
  };
  return args.some(walk);
}

/** `callCarries`, as an assertion with a message worth reading. */
export function expectSends(args: unknown[], needle: string, why: string): void {
  expect(
    callCarries(args, needle),
    `${why} — "${needle}" is not anywhere in the request: ${JSON.stringify(args, replacer).slice(0, 400)}`,
  ).toBe(true);
}

/** `URLSearchParams` and functions stringify to nothing useful; make them legible in a failure. */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof URLSearchParams) return `URLSearchParams(${value.toString()})`;
  if (typeof value === 'function') return '[function]';
  return value;
}

/**
 * Assert the section renders something out of the response.
 *
 * **This is the FAPI class**, and it is the one a request assertion cannot reach. The wizard read
 * `requestUri` from a response carrying `request_uri`, so the request was perfect and the next step
 * silently did nothing. The only way to see that is to hand the section a realistic response and check
 * that a value from it reaches the screen.
 */
export async function expectReadsBack(value: string | RegExp, what: string): Promise<void> {
  await waitFor(
    () => {
      const found = screen.queryAllByText(value);
      expect(
        found.length,
        `${what}: nothing on screen came from the response. A renamed field would look exactly like this.`,
      ).toBeGreaterThan(0);
    },
    { timeout: 3000 },
  );
}

/**
 * Capture a front-channel navigation instead of performing one.
 *
 * The authorization request is `window.location.href = url` — a real browser navigation, which jsdom
 * answers with a console warning and no observable effect. So a wizard step whose entire job is to
 * *compose that URL correctly* is unobservable by default, which is exactly how the FAPI wizard's
 * step 3→4 stayed broken: it read `requestUri` from a response carrying `request_uri`, returned early
 * on `undefined`, and the only visible symptom was a button that did nothing.
 *
 * Returns a live handle — read `nav.href` after pressing the control. `resetSectionState` restores the
 * real `location`, so a test that forgets to clean up cannot leak into the next file.
 */
export function stubNavigation(): { readonly href: string } {
  if (!realLocation) realLocation = window.location;
  const stub = {
    ...Object.fromEntries(
      (
        ['origin', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash'] as const
      ).map((k) => [k, realLocation![k]]),
    ),
    href: '',
    assign(url: string) {
      this.href = url;
    },
    replace(url: string) {
      this.href = url;
    },
  };
  Object.defineProperty(window, 'location', { value: stub, writable: true, configurable: true });
  return stub as { readonly href: string };
}

let realLocation: Location | undefined;

/** Reset everything a section could have left behind. Call in `beforeEach`. */
export function resetSectionState(): void {
  sessionStorage.clear();
  vi.restoreAllMocks();
  if (realLocation) {
    Object.defineProperty(window, 'location', {
      value: realLocation,
      writable: true,
      configurable: true,
    });
    realLocation = undefined;
  }
}
