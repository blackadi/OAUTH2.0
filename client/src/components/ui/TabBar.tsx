import { cn } from '@/utils/cn';

interface TabBarOption<T extends string> {
  value: T;
  label: string;
}

interface TabBarProps<T extends string> {
  options: TabBarOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}

/**
 * A tab list, with the semantics to match.
 *
 * These were plain buttons: a screen reader announced "button" with no indication that they form a set,
 * how many there are, or which is current — the selected state existed only as a background colour.
 * `role="tablist"` plus `aria-selected` gives that for free, and arrow-key navigation is what a tab list
 * is expected to do.
 */
function TabBar<T extends string>({ options, value, onChange, disabled, className, label }: TabBarProps<T>) {
  const move = (event: React.KeyboardEvent, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    // Follow focus to the newly selected tab, which is what the pattern expects.
    const list = event.currentTarget.parentElement;
    (list?.querySelectorAll('[role="tab"]')[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} role="tablist" aria-label={label}>
      {label && <span className="text-xs text-muted-foreground leading-8">{label}</span>}
      {options.map((op, index) => (
        <button
          key={op.value}
          role="tab"
          aria-selected={value === op.value}
          tabIndex={value === op.value ? 0 : -1}
          onKeyDown={(e) => move(e, index)}
          onClick={() => onChange(op.value)}
          disabled={disabled}
          className={cn(
            'px-2.5 py-1 text-xs rounded-full border cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            value === op.value
              ? 'bg-indigo-500/20 text-accent-text border-indigo-500/50'
              : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground',
          )}
        >
          {op.label}
        </button>
      ))}
    </div>
  );
}

export { TabBar };
export type { TabBarOption };
