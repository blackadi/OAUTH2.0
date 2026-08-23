/**
 * The routes, classified — and the viewports each class is held to.
 *
 * This encodes the product's declared responsive posture ("responsive reading, desktop doing") so the
 * specs cannot quietly drift from it. The two classes are held to *different* standards on purpose:
 *
 * - **Reading surfaces** must hold from 360px up. A learner arriving from a shared link on a phone has
 *   to be able to read everything. A failure here is a real defect.
 * - **Doing surfaces** are desktop-optimised. Collapsing to one column on a phone is *fine and
 *   intended*; what is not fine is breaking **silently** — horizontal overflow, clipped content, an
 *   unreachable control. So the narrow check on a doing surface asks only that one question.
 *
 * Getting this distinction into code matters because the tempting mistake is to screenshot everything at
 * 360px and file twenty findings against panes that were never meant for a phone.
 */

export type SurfaceClass = 'reading' | 'doing';

export interface Surface {
  path: string;
  name: string;
  cls: SurfaceClass;
  /** A selector that proves the section actually mounted, rather than the Suspense skeleton. */
  ready: string;
}

/** Every viewport a reading surface is checked at. */
export const READING_VIEWPORTS = [
  { name: '360', width: 360, height: 800 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
] as const;

/** Doing surfaces are captured wide, plus one narrow pass purely to catch a silent break. */
export const DOING_VIEWPORTS = [
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
] as const;

export const NARROW = { name: '360', width: 360, height: 800 } as const;

/**
 * `h1` is the readiness selector for every section, which is only true because A11Y-03 was fixed —
 * `SectionPanel` renders the page title as `h1` now, and the route suite asserts exactly one per route.
 */
const H1 = 'h1';

export const SURFACES: Surface[] = [
  // ── the one reading surface ──────────────────────────────────────────────────────────────────────
  { path: '/reference', name: 'reference', cls: 'reading', ready: H1 },

  // ── doing surfaces ──────────────────────────────────────────────────────────────────────────────
  { path: '/auth-flows', name: 'auth-flows', cls: 'doing', ready: H1 },
  { path: '/token-ops', name: 'token-ops', cls: 'doing', ready: H1 },
  { path: '/token-exchange', name: 'token-exchange', cls: 'doing', ready: H1 },
  { path: '/step-up', name: 'step-up', cls: 'doing', ready: H1 },
  { path: '/logout', name: 'logout', cls: 'doing', ready: H1 },
  { path: '/dcr', name: 'dcr', cls: 'doing', ready: H1 },
  { path: '/ciba', name: 'ciba', cls: 'doing', ready: H1 },
  { path: '/par', name: 'par', cls: 'doing', ready: H1 },
  { path: '/rar', name: 'rar', cls: 'doing', ready: H1 },
  { path: '/jar', name: 'jar', cls: 'doing', ready: H1 },
  { path: '/device', name: 'device', cls: 'doing', ready: H1 },
  { path: '/backchannel-logout', name: 'backchannel-logout', cls: 'doing', ready: H1 },
  { path: '/discovery', name: 'discovery', cls: 'doing', ready: H1 },
  { path: '/federation', name: 'federation', cls: 'doing', ready: H1 },
  { path: '/fapi', name: 'fapi', cls: 'doing', ready: H1 },
  { path: '/mcp', name: 'mcp', cls: 'doing', ready: H1 },
  { path: '/vci', name: 'vci', cls: 'doing', ready: H1 },
  { path: '/admin', name: 'admin', cls: 'doing', ready: H1 },
  { path: '/client-mgmt', name: 'client-mgmt', cls: 'doing', ready: H1 },
  { path: '/grant-mgmt', name: 'grant-mgmt', cls: 'doing', ready: H1 },
  { path: '/health', name: 'health', cls: 'doing', ready: H1 },
];

export const READING = SURFACES.filter((s) => s.cls === 'reading');
export const DOING = SURFACES.filter((s) => s.cls === 'doing');
