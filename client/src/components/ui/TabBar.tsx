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

function TabBar<T extends string>({ options, value, onChange, disabled, className, label }: TabBarProps<T>) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {label && <span className="text-xs text-muted-foreground leading-8">{label}</span>}
      {options.map((op) => (
        <button
          key={op.value}
          onClick={() => onChange(op.value)}
          disabled={disabled}
          className={cn(
            'px-2.5 py-1 text-xs rounded-full border cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            value === op.value
              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50'
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
