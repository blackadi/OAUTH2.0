import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
  ({ className, label, error, hint, id, type, ...props }, ref) => {
    /**
     * A secret you cannot read is a secret you cannot check.
     *
     * Seven `Input`-based fields in this application are `type="password"`, and every one of them
     * holds a value the reader typed in order to watch it travel — a management credential, a client
     * secret. This is a debugger: the premise is that you can see exactly what was sent, and a field
     * that hides its own contents from the person who typed them contradicts it. One misread
     * character in a client secret surfaces two steps later as an opaque vendor code.
     *
     * The masking still defaults on, because the value is a credential and shoulder-surfing is real.
     * What changes is that it is now the reader's choice rather than the field's.
     */
    const [revealed, setRevealed] = useState(false);
    const isSecret = type === 'password';
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
        <div className="relative">
          <input
            id={inputId}
            type={isSecret && revealed ? 'text' : type}
            className={cn(
              'flex h-10 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-danger-text focus:ring-danger-text',
              // Room for the toggle, so a long secret does not run under it.
              isSecret && 'pr-10',
              className,
            )}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            ref={ref}
            {...props}
          />
          {isSecret && (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              /**
               * `aria-pressed` rather than two labels that swap: the control is one toggle with a
               * state, and a name that changes under a screen reader reads as a different button
               * appearing. `aria-controls` names the field so the pairing is not left to proximity.
               */
              aria-pressed={revealed}
              aria-controls={inputId}
              aria-label={label ? `Reveal ${label}` : 'Reveal the value'}
              title={revealed ? 'Hide' : 'Reveal'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
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
