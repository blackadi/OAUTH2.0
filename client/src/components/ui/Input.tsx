import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';
import { Prose } from '@/components/ui/Prose';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /**
   * Where the value comes from, for a field whose correct value is not guessable.
   *
   * Distinct from `placeholder`, which vanishes the moment anyone types and is therefore no use to the
   * person who has already typed the wrong thing. Distinct from `error`, which says a value *is* wrong;
   * a hint says where the right one lives. Wired to the input through `aria-describedby`, so it reaches
   * a screen reader rather than only the sighted reader — a hint nobody hears is a hint that only helps
   * the users who needed it least.
   */
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;
    // Both, in that order, when both exist — the error is the more urgent of the two and a screen reader
    // announces `aria-describedby` in the order given. `undefined` rather than an empty string when
    // neither exists, because `aria-describedby=""` points at nothing and is worse than no attribute.
    const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm text-muted-foreground">
            {label}
          </label>
        )}
        <input
          id={inputId}
          className={cn(
            'flex h-10 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-danger-text focus:ring-danger-text',
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          ref={ref}
          {...props}
        />
        {error && (
          <span id={errorId} className="text-xs text-danger-text" role="alert">
            {error}
          </span>
        )}
        {hint && (
          <Prose id={hintId} as="p" className="text-2xs text-muted-foreground leading-relaxed m-0">
            {hint}
          </Prose>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

export { Input };
