import { useCallback } from 'react';
import { PanelRightClose } from 'lucide-react';
import { TabBar } from '@/components/ui/TabBar';
import { TracePanel } from '@/components/trace/TracePanel';
import { JwsScratchpad } from '@/components/ui/JwsScratchpad';
import { RAIL_WIDTH, clampRailWidth, type RailTab } from '@/services/preferences';

/**
 * The evidence rail — what the app knows, kept beside what you are doing.
 *
 * **The problem it solves is placement, not features.** Every piece of evidence this debugger captures
 * already existed and was already good; it was scattered across three unrelated disclosure idioms at
 * three different edges of the window. Tokens lived in the sidebar *footer*, under a 22-item navigation
 * list, in a 224px rail — and `AppLayout`'s shell bug put them 1,737px below the fold on any route
 * taller than the viewport. The request trace was a `position: fixed` drawer that **covered the content
 * it explained**, which `AppLayout` compensated for by reserving `min(52vh, 30rem)` of bottom padding
 * whenever it was open. A decoded token appeared inline in whichever section happened to produce it, and
 * nowhere at all for a token you brought with you.
 *
 * Meanwhile the navigation — consulted once per task — held a full-height column permanently. For a tool
 * whose entire claim is *"see exactly what happened"*, that is the wrong way round: the surface you
 * consult constantly got the scraps.
 *
 * So: **left navigates, centre acts, right is evidence.** Three tabs, one place, persistent across
 * navigation, and wide enough that `JwtInspector` renders in the layout it was designed for instead of
 * the 7px-wide claim column a 224px rail forced on it.
 *
 * Two things it deliberately does **not** do. It does not exist below `lg:` — there the sidebar is
 * already hidden, the vault is in the mobile drawer and the trace is still the bottom sheet, because a
 * 380px rail on a 360px screen is not a rail. And it does not replace the inline result panes: seeing
 * the response beside the request that produced it is the section's job, and this is the *standing*
 * record rather than the immediate one.
 */

interface EvidenceRailProps {
  open: boolean;
  onClose: () => void;
  tab: RailTab;
  onTabChange: (tab: RailTab) => void;
  width: number;
  onWidthChange: (width: number) => void;
  /** The Token Vault, passed in rather than imported, so this file owns no session state. */
  tokenVault: React.ReactNode;
  traceCount: number;
}

function EvidenceRail({
  open,
  onClose,
  tab,
  onTabChange,
  width,
  onWidthChange,
  tokenVault,
  traceCount,
}: EvidenceRailProps) {
  /**
   * Resize from the *right edge of the window*, not from a delta.
   *
   * Tracking `event.clientX` against the window is idempotent: a pointer that leaves the handle, or a
   * frame the browser drops, cannot accumulate drift the way `width - deltaX` does. `setPointerCapture`
   * keeps the move events coming after the pointer crosses into the iframe-less void of the main pane,
   * which is where a drag ends up the moment you widen past the handle.
   */
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent) =>
        onWidthChange(clampRailWidth(window.innerWidth - e.clientX));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [onWidthChange],
  );

  /**
   * The same resize from the keyboard, which is not optional.
   *
   * A drag handle with no key bindings is a mouse-only control, and this one governs how much of the
   * screen the content pane gets. `separator` with `aria-valuenow` is the ARIA window-splitter pattern;
   * the arrow directions are inverted against the axis on purpose — Left grows the rail because the rail
   * grows leftwards.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 48 : 16;
      const delta = event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
      if (!delta) return;
      event.preventDefault();
      onWidthChange(clampRailWidth(width + delta));
    },
    [width, onWidthChange],
  );

  if (!open) return null;

  return (
    <aside
      aria-label="Evidence"
      className="hidden lg:flex shrink-0 border-l border-border bg-card"
      style={{ width }}
    >
      {/*
        The handle is a sibling of the content, inside the rail, so the rail's own border is what you
        grab. `w-1` with a `-ml-1` hit area would be a 4px target; `w-1.5` plus the cursor change is the
        smallest thing that is still findable, and the keyboard path above is what makes it accessible
        rather than merely present.
      */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the evidence rail"
        aria-valuenow={Math.round(width)}
        aria-valuemin={RAIL_WIDTH.min}
        aria-valuemax={RAIL_WIDTH.max}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-tint-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
      />

      <div className="flex flex-col min-w-0 min-h-0 flex-1">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <TabBar
            label="Evidence"
            value={tab}
            onChange={onTabChange}
            options={[
              { value: 'tokens', label: 'Tokens' },
              // The count is on the tab because the reason the trace exists is that a non-2xx used to
              // vanish into a toast. A number you can see without opening the tab is the whole point.
              { value: 'trace', label: traceCount > 0 ? `Trace · ${traceCount}` : 'Trace' },
              { value: 'inspect', label: 'Inspect' },
            ]}
            className="min-w-0 flex-1"
          />
          {/*
            "Close", not "Hide", and the distinction is an accessibility requirement rather than a
            preference. The header carries a *toggle* for this rail whose label is already "Hide the
            evidence rail" when it is open; naming this one the same thing puts two buttons with an
            identical accessible name and an identical action in the tree at once, which a screen-reader
            user hears as an ambiguity they have no way to resolve. Found by a Playwright strict-mode
            violation, which is the only thing in the repo that could have found it.
          */}
          <button
            onClick={onClose}
            aria-label="Close the evidence rail"
            title="Close the evidence rail"
            className="p-1 shrink-0 rounded text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>

        {/*
          All three tabs are *unmounted* when not selected, and that is the opposite of the call
          `AuthFlowsSection` makes about its two panels — deliberately, because the reason there does not
          apply here. That section keeps both mounted because unmounting discards flow state a user is
          part-way through, including a DPoP key already written to the session. None of these three holds
          anything of the kind: the vault and the trace read from stores that outlive them, and the
          scratchpad holds text a person can see. What unmounting buys is one `role="region"` in the tree
          at a time.
        */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'tokens' && <div className="h-full overflow-y-auto p-3">{tokenVault}</div>}
          {tab === 'trace' && <TracePanel open onClose={onClose} variant="pane" />}
          {tab === 'inspect' && <JwsScratchpad />}
        </div>
      </div>
    </aside>
  );
}

export { EvidenceRail };
