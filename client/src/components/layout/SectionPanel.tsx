import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { SkeletonCard } from '@/components/ui/Skeleton';

interface SectionPanelProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  loading?: boolean;
}

function SectionPanel({ title, description, icon, children, className, actions, loading }: SectionPanelProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      <div className="px-5 pt-5 pb-3 space-y-1.5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                {icon}
              </div>
            )}
            <div>
              <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
              {description && (
                <p className="text-xs text-muted-foreground/80 mt-0.5 max-w-prose">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      </div>
      <div className="px-5 pb-5">
        {loading ? <SkeletonCard /> : children}
      </div>
    </div>
  );
}

export { SectionPanel };
