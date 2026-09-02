import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { EvidenceRail } from './EvidenceRail';
import { ErrorBoundary } from './ErrorBoundary';
import { Menu, X, Bug, Activity, Sun, Moon, MonitorCog, PanelRight, Search } from 'lucide-react';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { TokenVault } from '@/components/ui/TokenVault';
import { cn } from '@/utils/cn';
import { useServerStatus } from '@/hooks/useServerStatus';
import { useTraces } from '@/hooks/useTraces';
import { useTheme } from '@/hooks/useTheme';
import { useHashScroll } from '@/hooks/useHashScroll';
import { useMediaQuery, DESKTOP_QUERY } from '@/hooks/useMediaQuery';
import { TracePanel } from '@/components/trace/TracePanel';
import { LiveAnnouncer } from '@/components/ui/LiveAnnouncer';
import { CommandPalette } from './CommandPalette';
import { buildReferenceCommands, buildSectionCommands, type Command } from '@/utils/command-index';
import {
  readRailOpen,
  setRailOpen as persistRailOpen,
  readRailTab,
  setRailTab as persistRailTab,
  readRailWidth,
  setRailWidth as persistRailWidth,
  type RailTab,
} from '@/services/preferences';
import type { SectionGroup } from '@/App';

interface AppLayoutProps {
  groups: SectionGroup[];
}

/**
 * The width at which the evidence rail opens on its own — derived, not chosen.
 *
 * The rail is *available* from `lg:` (1024px), but opening it there by default would take the signature
 * request/response layout away from somebody who never asked for a rail, which is a bad trade to make on
 * their behalf. `SplitPane` goes to two columns at a **container** width of 44rem (704px), so the
 * question is which viewport still clears that with the rail in place:
 *
 *     content pane   = viewport − 224 (sidebar) − 380 (rail default)
 *     container      = min(1024, content pane) − 64 (`xl:p-8`, both sides)
 *     two columns   ⇔ container ≥ 704  ⇔  viewport ≥ 1372
 *
 * So 1440 — the first common display width above that bound — and **1372 is the number that matters**:
 * a 1366×768 laptop is below it and correctly does not auto-open, while 1440, 1512, 1600 and up do.
 * Confirmed by screenshot at 1440 rather than trusted from the arithmetic. Below the threshold the rail
 * is one click away and, once clicked, remembered forever.
 */
const RAIL_AUTO_OPEN_WIDTH = 1440;

/**
 * Which modifier the palette advertises, decided once.
 *
 * `navigator.platform` is deprecated and still the only thing every browser agrees on; the modern
 * replacement (`navigator.userAgentData`) is unavailable in Firefox and Safari, which is most of the
 * audience this label is for. Getting it wrong is not cosmetic — a Mac user who reads "Ctrl K" tries it,
 * nothing happens, and concludes the feature does not work. Both chords are bound regardless of what the
 * label says.
 */
const IS_APPLE =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
const PALETTE_HINT = IS_APPLE ? '⌘K' : 'Ctrl K';

function AppLayout({ groups }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const traces = useTraces();
  const { choice: themeChoice, resolved: themeResolved, cycle: cycleTheme } = useTheme();
  const failures = traces.filter((t) => !t.ok).length;
  const navigate = useNavigate();

  /**
   * The rail's three pieces of state, each read once from `localStorage` and written back on change.
   *
   * `readRailOpen()` returns `null` for "never chosen", which is why the fallback is a width test rather
   * than a constant — see the note on `railOpen` in `preferences.ts` for why that distinction is stored
   * rather than collapsed.
   */
  const [railOpen, setRailOpenState] = useState(
    () => readRailOpen() ?? window.innerWidth >= RAIL_AUTO_OPEN_WIDTH,
  );
  const [railTab, setRailTabState] = useState<RailTab>(readRailTab);
  const [railWidth, setRailWidthState] = useState(readRailWidth);

  const setRailOpen = useCallback((open: boolean) => {
    setRailOpenState(open);
    persistRailOpen(open);
  }, []);
  const setRailTab = useCallback((tab: RailTab) => {
    setRailTabState(tab);
    persistRailTab(tab);
  }, []);
  /* Width persists on every change rather than on drag end: `localStorage` writes are cheap next to the
     layout the drag is already causing, and a drag that ends in a closed tab still ends. */
  const setRailWidth = useCallback((width: number) => {
    setRailWidthState(width);
    persistRailWidth(width);
  }, []);

  /**
   * Whether the rail exists at all right now — and this is the one thing CSS cannot answer for us.
   *
   * The trace has two homes: a pane in the rail on a desktop, the original bottom sheet on a phone.
   * Rendering both and hiding one would put two `role="region"` landmarks with the same accessible name
   * in the tree and split the panel's filter and view state across two instances. `DESKTOP_QUERY` is
   * 1024px, the same number `lg:` compiles to, named once so the two cannot drift.
   */
  const railAvailable = useMediaQuery(DESKTOP_QUERY);
  const traceInRail = railAvailable && railOpen && railTab === 'trace';

  /**
   * One control, two mechanisms, because "show me the requests" is one intent.
   *
   * On a desktop it puts the rail on the Trace tab — and closes the rail if that is already what you are
   * looking at, so the button toggles rather than merely re-asserting. On a phone there is no rail, so it
   * is the bottom sheet exactly as before.
   */
  const [paletteOpen, setPaletteOpen] = useState(false);

  /**
   * Open any evidence surface by name, from wherever the app currently keeps it.
   *
   * The palette should not have to know that the rail exists only above `lg:` — it asks for "the trace"
   * and this decides whether that means the rail's Trace tab or the bottom sheet. Below `lg:` the vault
   * lives in the mobile drawer, so "the tokens" opens that instead.
   */
  const openEvidence = useCallback(
    (tab: RailTab) => {
      if (railAvailable) {
        setRailTab(tab);
        setRailOpen(true);
        return;
      }
      if (tab === 'trace') setTraceOpen(true);
      else setMobileMenuOpen(true);
    },
    [railAvailable, setRailOpen, setRailTab],
  );

  const toggleTrace = useCallback(() => {
    if (railAvailable) {
      if (railOpen && railTab === 'trace') setRailOpen(false);
      else {
        setRailTab('trace');
        setRailOpen(true);
      }
      return;
    }
    setTraceOpen((o) => !o);
  }, [railAvailable, railOpen, railTab, setRailOpen, setRailTab]);

  /**
   * The command index: actions first, then the sections, then the whole cited corpus.
   *
   * Split into three memos because they change on three different clocks. The reference entries are
   * static data and are built once; the sections change only if the route table does; the actions close
   * over live state and have to be rebuilt when it moves — a stale `run` would toggle the rail towards
   * the state it was already in.
   */
  const referenceCommands = useMemo(() => buildReferenceCommands(), []);
  const sectionCommands = useMemo(() => buildSectionCommands(groups), [groups]);
  const actionCommands = useMemo<Command[]>(() => {
    const actions: Command[] = [
      {
        id: 'action-theme',
        kind: 'action',
        title: 'Switch the theme',
        subtitle: `system → dark → light · currently ${themeChoice}`,
        keywords: ['dark', 'light', 'colour', 'color', 'appearance', 'contrast'],
        run: cycleTheme,
      },
      {
        id: 'action-trace',
        kind: 'action',
        title: 'Open the request trace',
        subtitle: 'Every HTTP call, with status, headers and timing',
        keywords: ['requests', 'history', 'network', 'status', 'failures', 'curl'],
        run: () => openEvidence('trace'),
      },
      {
        id: 'action-tokens',
        kind: 'action',
        title: 'Open the token vault',
        subtitle: 'What this session holds, and what each token may be used for',
        keywords: ['access token', 'id token', 'refresh token', 'session'],
        run: () => openEvidence('tokens'),
      },
    ];

    /*
      Offered only where they can work. Below `lg:` there is no rail, so "decode a JWS" has nowhere to
      go and "hide the rail" would toggle something invisible — and a palette entry that does nothing is
      worse than an absent one, which is the lesson the MCP wizard's enabled-but-inert step taught.
    */
    if (railAvailable) {
      actions.push({
        id: 'action-inspect',
        kind: 'action',
        title: 'Decode a JWS',
        subtitle: 'Paste an ID token, a JWT access token, a DPoP proof, a request object',
        keywords: ['jwt', 'jws', 'decode', 'verify', 'claims', 'inspect', 'signature'],
        run: () => openEvidence('inspect'),
      });
      actions.push({
        id: 'action-rail',
        kind: 'action',
        title: railOpen ? 'Hide the evidence rail' : 'Show the evidence rail',
        subtitle: 'Tokens, the request trace and the JWS inspector',
        keywords: ['panel', 'rail', 'evidence', 'layout'],
        run: () => setRailOpen(!railOpen),
      });
    }
    return actions;
  }, [themeChoice, cycleTheme, openEvidence, railAvailable, railOpen, setRailOpen]);

  const commands = useMemo(
    () => [...actionCommands, ...sectionCommands, ...referenceCommands],
    [actionCommands, sectionCommands, referenceCommands],
  );

  /**
   * `⌘K` and `Ctrl+K`, bound on the window, plus `popstate`.
   *
   * Both chords, always, whatever the label says — a hard-coded `metaKey` strands every Linux and Windows
   * user and a hard-coded `ctrlKey` strands every Mac one. `preventDefault` matters: `Ctrl+K` focuses the
   * address bar in Chrome and the search bar in Firefox, so without it the palette opens *behind* a
   * focused browser control.
   *
   * `popstate` closes it because in-app navigation goes through `run`, which closes it first — the one
   * path that does not is the browser's own Back button, and a modal left floating over a page it was not
   * opened from is disorienting rather than merely untidy.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    const onPopState = () => setPaletteOpen(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);
  const location = useLocation();
  const activePath = location.pathname;
  const { status, uptime } = useServerStatus();
  const mainRef = useRef<HTMLElement>(null);

  // A `#step-3` in the address bar has to wait for the lazy section to arrive before it can
  // resolve. Called here rather than per section, so every route gets it for free.
  useHashScroll();

  /**
   * Move focus to the content region **on navigation**, and not on first paint.
   *
   * A client-side route change replaces the whole page without moving focus, so a keyboard or
   * screen-reader user stayed wherever they were — usually on the sidebar link they just activated — and
   * had no indication that the content had changed. `tabIndex={-1}` makes the region programmatically
   * focusable without adding it to the tab order.
   *
   * **The guard is not an optimisation.** Without it this effect fires on mount, so a fresh page load
   * begins with focus already *inside* `#main` — and the very first Tab then lands on whatever control is
   * first in the content, skipping past the skip link entirely. That makes the skip link unreachable by
   * the one keystroke it exists to serve. Caught by a Playwright keyboard test, and by nothing else:
   * jsdom does not model a document's initial focus position.
   *
   * **And it compares the path rather than counting renders**, which is the second half of the same
   * lesson `CallbackPage`'s latch teaches. A `useRef(true)` boolean is *consumed by StrictMode's
   * double-invoke*: the first run flips it, the cleanup runs, and the second run sails through and steals
   * focus anyway. Remembering which path was last focused for is idempotent, so running twice is
   * indistinguishable from running once.
   */
  const focusedPathRef = useRef<string | null>(null);
  useEffect(() => {
    // First mount: remember where we are and move nothing.
    if (focusedPathRef.current === null) {
      focusedPathRef.current = activePath;
      return;
    }
    // Same route, re-run: nothing navigated, so nothing should move.
    if (focusedPathRef.current === activePath) return;
    focusedPathRef.current = activePath;
    mainRef.current?.focus();
  }, [activePath]);

  return (
    /*
      `min-h-screen` below `lg:`, an actual **app shell** at `lg:` and above — and the difference is the
      whole reason the sidebar could vanish.

      Everything in the desktop chrome was already written for a shell: the row below is
      `overflow-hidden`, the sidebar's `nav` is `flex-1 overflow-y-auto`, `main` is `overflow-y-auto`.
      None of it worked, because `min-h-screen` is a *minimum* — the row grew to whatever the section
      rendered, so nothing ever clipped and neither scroll container ever engaged. Measured on
      `/auth-flows` at 1440x900: the document was 2,694px tall, the `<aside>` was 2,646px of that, and
      the Token Vault sat at **y = 2,637** — 1,737px below the fold, on a rail that scrolled away with
      the page. Opening the vault's JWT inspector took the aside to ~8,700px and squeezed `nav` from
      2,575px to 992px, which is the "the sidebar looks missing" screenshot.

      Constrained only at `lg:`, deliberately. Below that the sidebar is hidden and the two reading
      surfaces are prose, which belongs in the document scroll a phone already gives you for free —
      trapping it in an inner scroller costs pull-to-refresh and address-bar collapse for nothing. This
      is the declared posture ("responsive reading, desktop doing") expressed in one class.
    */
    <div className="min-h-screen lg:h-dvh flex flex-col bg-background">
      {/* Twenty nav items sit between the top of the document and the content. Without this, reaching
          the page by keyboard means tabbing through all of them on every navigation. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-card focus:text-foreground focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      {/*
        `flex-wrap` and `min-h-12` rather than a fixed `h-12` non-wrapping row.

        This header holds five groups — menu, identity, trace, theme, status — and only two of them hide
        below `sm:`. At 360px the available width is 328px after padding and the intrinsic widths exceed
        it, so a non-wrapping row either pushes the page body sideways or squashes its children
        unpredictably. It is chrome on *every* route, including `/callback`, which is the one surface a
        learner is most likely to reach on a phone from a redirect — so a horizontally scrolling page
        here is the exact failure the responsive posture exists to prevent, on every screen at once.
      */}
      <header className="min-h-12 border-b border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 shrink-0 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 min-w-0 bg-transparent border-none cursor-pointer"
          >
            {/* The system's one sanctioned gradient, not a second one invented for the mark.
                This was a raw Tailwind shade-literal pair ramping indigo into violet: unthemeable, so
                it read identically on both palettes, and that particular ramp is the single most
                recognisable tell of a generated developer tool. These tokens are the same measured
                stops the primary button uses, so the white glyph clears 4.5:1 at every point along
                the ramp; the pair they replace was never measured at all.

                Deliberately not quoting the old class names here — the design detector matches them
                as a literal, so writing them down reintroduces the finding in a comment. */}
            <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br from-accent-grad-from to-accent-grad-to">
              <Bug className="h-4 w-4 text-white" />
            </span>
            <span className="text-sm font-semibold text-foreground tracking-tight truncate">
              OAuth Debugger
            </span>
          </button>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/*
            The palette's discoverability affordance, and it is not optional.

            A keyboard shortcut nobody is told about is a feature for the person who wrote it. This is
            the standard answer — a visible search control that names its own chord — and it is a real
            button rather than a decorative hint, because the shortcut is unreachable on a touch device
            and this is the only way in there. The label collapses to the icon below `sm:`, where the
            header has five groups competing for 328px.
          */}
          <button
            onClick={() => setPaletteOpen(true)}
            title={`Search sections, parameters, claims and error codes (${PALETTE_HINT})`}
            aria-label="Open the command palette"
            aria-keyshortcuts="Meta+K Control+K"
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-muted-foreground border border-transparent hover:text-foreground cursor-pointer transition-colors"
          >
            <Search className="h-3 w-3" />
            <span className="hidden sm:inline text-2xs font-medium uppercase tracking-wider">
              Search
            </span>
            <kbd className="hidden md:inline text-2xs font-mono text-muted-foreground">
              {PALETTE_HINT}
            </kbd>
          </button>
          {/* Every HTTP call the app makes is recorded by `transport.ts`; this opens the history. The
              failure count is surfaced on the button itself because the whole reason the panel exists is
              that a non-2xx used to vanish into a red toast with no status attached. */}
          <button
            onClick={toggleTrace}
            aria-expanded={traceInRail || traceOpen}
            title="Request trace — every HTTP call, with status, headers and timing"
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md border cursor-pointer transition-colors',
              traceInRail || traceOpen
                ? 'bg-tint-accent-strong text-accent-text border-edge-accent'
                : 'bg-muted/50 text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            <Activity className="h-3 w-3" />
            <span className="text-2xs font-medium uppercase tracking-wider">Trace</span>
            {traces.length > 0 && (
              <span className="text-2xs font-mono tabular-nums">
                {traces.length}
                {failures > 0 && <span className="text-warning-text"> ·{failures}</span>}
              </span>
            )}
          </button>
          {/*
            The rail toggle, hidden by CSS below `lg:` rather than by `railAvailable`.

            A control whose presence is decided in JavaScript flickers on first paint, because
            `matchMedia` is read after mount. The class is evaluated by the stylesheet before anything
            renders, and `DESKTOP_QUERY` is the same 1024px, so the two agree by construction.
          */}
          <button
            onClick={() => setRailOpen(!railOpen)}
            aria-expanded={railOpen}
            title={
              railOpen
                ? 'Hide the evidence rail — tokens, the request trace and the JWS inspector'
                : 'Show the evidence rail — tokens, the request trace and the JWS inspector'
            }
            aria-label={railOpen ? 'Hide the evidence rail' : 'Show the evidence rail'}
            className={cn(
              'hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md border cursor-pointer transition-colors',
              railOpen
                ? 'bg-tint-accent-strong text-accent-text border-edge-accent'
                : 'bg-muted/50 text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            <PanelRight className="h-3 w-3" />
          </button>
          {/* One button cycling system → dark → light, labelled with what it will do next rather than
              with what is currently showing — a control that names its own state leaves you guessing
              what pressing it achieves. */}
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-muted-foreground hover:text-foreground border-none cursor-pointer transition-colors"
            title={
              themeChoice === 'system'
                ? `Following the system (${themeResolved}). Click for dark.`
                : themeChoice === 'dark'
                  ? 'Dark. Click for light.'
                  : 'Light. Click to follow the system.'
            }
            aria-label={`Theme: ${themeChoice}. Change theme.`}
          >
            {themeChoice === 'system' ? (
              <MonitorCog className="h-3 w-3" />
            ) : themeChoice === 'dark' ? (
              <Moon className="h-3 w-3" />
            ) : (
              <Sun className="h-3 w-3" />
            )}
            <span className="text-2xs font-medium uppercase tracking-wider hidden sm:inline">
              {themeChoice}
            </span>
          </button>
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50"
            title={
              status === 'connected'
                ? `Server uptime: ${Math.floor(uptime ?? 0)}s`
                : 'Server unreachable'
            }
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-colors duration-500',
                // The dot is the signal; the glow was a second one saying the same thing. The three
                // `*-text` tokens are the measured semantic inks, so a status colour here is the same
                // colour the words elsewhere use for the same meaning.
                status === 'connected' && 'bg-success-text',
                status === 'disconnected' && 'bg-danger-text',
                status === 'checking' && 'bg-warning-text animate-pulse',
              )}
            />
            <span className="text-2xs text-muted-foreground font-medium uppercase tracking-wider">
              {status === 'connected' && 'Connected'}
              {status === 'disconnected' && 'Offline'}
              {status === 'checking' && 'Checking'}
            </span>
          </div>
          <span className="hidden sm:block text-2xs text-muted-foreground font-mono">
            Authlete Node Server
          </span>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-border bg-card max-h-[60vh] overflow-y-auto">
          <nav className="p-2 space-y-1">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {group.label}
                </div>
                {group.sections.map((section) => (
                  <Link
                    key={section.id}
                    to={section.path}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={activePath === section.path ? 'page' : undefined}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-left cursor-pointer border-none no-underline transition-colors',
                      activePath === section.path
                        ? 'bg-tint-accent text-accent-text font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                    )}
                  >
                    <span className="shrink-0 text-current">{section.icon}</span>
                    <span>{section.label}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          {/*
            The vault belongs in the mobile drawer too.

            **Found by rendering** (2026-08-22): `sidebarHeader` was passed only to `Sidebar`, which is
            `hidden lg:flex` — so below 1024px the Token Vault was **unreachable**. That is the app's only
            view of the tokens it holds and the only way to inspect or clear them, and nothing on screen
            hinted that it existed. A doing surface collapsing to one column is intended; a control
            disappearing with no trace is a silent break, which is the one thing the responsive posture
            does not permit.

            No unit test could see this: `sections.smoke.test.tsx` and `App.routes.test.tsx` both render
            in jsdom, where `hidden lg:flex` has no effect because there is no viewport.
          */}
          <div className="border-t border-border p-3">
            <TokenVault />
          </div>
        </div>
      )}

      {/* `min-h-0` is not decoration: a `flex-1` child of a column defaults to `min-height: auto`, which
          refuses to shrink below its content — so without it the row grows past the shell and
          `overflow-hidden` clips nothing, which is exactly the state described above. */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/*
          The vault has exactly one home at a time, and which one depends on whether the rail is open.

          In the rail it is the Tokens tab, expanded, in 380px. With the rail shut it falls back to the
          sidebar footer, collapsed, where it has always been. Rendering it in both would be two
          `TokenVault` instances with two independent expanded states and two Clear-session dialogs for
          one session — and the fallback is not optional, because a control that is only reachable after
          you discover a panel is a control that is missing for anyone who does not.
        */}
        <Sidebar groups={groups} header={railOpen ? undefined : <TokenVault />} />
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 min-w-0 overflow-y-auto outline-none"
        >
          <div
            className="max-w-5xl mx-auto p-4 lg:p-6 xl:p-8"
            /* Reserve the *drawer's* height while it is open — and only the drawer's. In the rail the
               trace sits beside the content rather than on top of it, which is most of the reason the
               rail exists, so there is nothing to reserve. */
            style={traceOpen && !railAvailable ? { paddingBottom: 'min(52vh, 30rem)' } : undefined}
          >
            <ErrorBoundary>
              {/* A skeleton, not a spinner: a lazy section swapping a centred 200px spinner for a
                  full panel shifts the layout on every navigation. The skeleton occupies roughly the
                  shape that is about to arrive. */}
              <Suspense fallback={<SkeletonCard />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
        <EvidenceRail
          open={railOpen}
          onClose={() => setRailOpen(false)}
          tab={railTab}
          onTabChange={setRailTab}
          width={railWidth}
          onWidthChange={setRailWidth}
          tokenVault={<TokenVault defaultExpanded />}
          traceCount={traces.length}
        />
      </div>

      {/* The bottom sheet is what a phone gets, and only a phone: above `lg:` the same panel is a pane
          in the rail, and two of them would be two landmarks with one name. */}
      {!railAvailable && <TracePanel open={traceOpen} onClose={() => setTraceOpen(false)} />}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        onNavigate={navigate}
      />
      <LiveAnnouncer />
    </div>
  );
}

export { AppLayout };
