import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  className?: string;
  leftClassName?: string;
  rightClassName?: string;
  leftLabel?: string;
  rightLabel?: string;
}

/**
 * Two panes when there is room for two panes — measured on the container, not the viewport.
 *
 * This was `grid-cols-1 xl:grid-cols-2`, and the constraint it was trying to express is **not a
 * viewport width**. The available room is the main region: `max-w-5xl`, minus a 224px sidebar that
 * appears at `lg:`, minus `p-4`/`lg:p-6`/`xl:p-8`. So a 1280px viewport does not reliably mean "there
 * is space for two columns", and the breakpoint had to be set conservatively enough to be safe
 * everywhere — which is why the signature two-pane inspector did not appear until 1280px, on a 1024px
 * laptop that had the room for it.
 *
 * `@container` measures the thing that actually decides. `44rem` is the threshold because two panes of
 * request/response monospace below ~22rem each stop being readable, and at that point one column is
 * genuinely better. Tailwind v4 ships container queries natively, so this needs no plugin.
 */
function SplitPane({
  left,
  right,
  className,
  leftClassName,
  rightClassName,
  leftLabel,
  rightLabel,
}: SplitPaneProps) {
  return (
    <div className={cn('@container', className)}>
      <div className="grid grid-cols-1 @[44rem]:grid-cols-2 gap-4">
        <div className={cn('space-y-3', leftClassName)}>
          {leftLabel && (
            <div className="flex items-center gap-2">
              <span className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                {leftLabel}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          {left}
        </div>
        <div className={cn('space-y-3', rightClassName)}>
          {rightLabel && (
            <div className="flex items-center gap-2">
              <span className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                {rightLabel}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          {right}
        </div>
      </div>
    </div>
  );
}

export { SplitPane };
