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

function SplitPane({ left, right, className, leftClassName, rightClassName, leftLabel, rightLabel }: SplitPaneProps) {
  return (
    <div className={cn('grid grid-cols-1 xl:grid-cols-2 gap-4', className)}>
      <div className={cn('space-y-3', leftClassName)}>
        {leftLabel && (
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground/60">{leftLabel}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        {left}
      </div>
      <div className={cn('space-y-3', rightClassName)}>
        {rightLabel && (
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground/60">{rightLabel}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        {right}
      </div>
    </div>
  );
}

export { SplitPane };
