import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface SectionPanelProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

function SectionPanel({
  title,
  description,
  icon,
  children,
  className,
  actions,
}: SectionPanelProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      <div className="px-5 pt-5 pb-3 space-y-1.5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-tint-accent text-accent-text shrink-0">
                {icon}
              </div>
            )}
            <div>
              {/* `h1`, not `h2`: this is the title of the page a route renders, and it used to be the
                  only heading on that page — so every one of the 20 routes presented a heading tree
                  with no root. Sub-headings inside a section start at `h2` from here. */}
              <h1 className="text-base font-semibold text-foreground tracking-tight">{title}</h1>
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      </div>
      {/* The `loading` prop and its `SkeletonCard` are gone: **no call site ever passed one** across all
          20 sections, and no section actually has a single whole-panel initial load — they each have
          independent operations with their own button spinners. The skeleton found its real home as the
          route-level Suspense fallback in `AppLayout`, where a swap from a spinner to full content was
          causing layout shift on every navigation. */}
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

export { SectionPanel };
