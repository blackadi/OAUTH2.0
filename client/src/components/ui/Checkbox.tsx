import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * The checkbox that did not exist, which is why every literal in this codebase was one.
 *
 * `Input`, `Select` and `Textarea` were primitives; the checkbox was not, so eight call sites across
 * seven files each rebuilt it — and **every one of them reached for a shade literal**,
 * an `accent-<shade>` literal, because `accent-color` has no token and the native control
 * has no other colour hook. A missing primitive does not stay missing; it gets re-implemented badly, in
 * this case in a codebase whose own rule forbids exactly what it forced.
 *
 * The native input is kept and styled rather than replaced by a div: it is the checkbox, it is already
 * in the accessibility tree with the right role and state, and it is already keyboard-operable. What is
 * replaced is `appearance`, so the mark is drawn from tokens and follows both palettes.
 *
 * `focus-visible` is a real ring here rather than the browser default — the other primitives ring, and
 * a control that does not is the inconsistency this file exists to end.
 */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Rendered beside the box and wired to it, so the whole row is the hit target. */
  label?: ReactNode;
  /** Sits under the label in muted type; associated with `aria-describedby`. */
  hint?: ReactNode;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, hint, id, ...props }, ref) => {
    const generated = useId();
    const inputId = id ?? generated;
    const hintId = hint ? `${inputId}-hint` : undefined;

    const box = (
      <input
        {...props}
        ref={ref}
        id={inputId}
        type="checkbox"
        aria-describedby={hintId}
        className={cn(
          'peer relative shrink-0 h-4 w-4 cursor-pointer appearance-none rounded-sm',
          'border border-border bg-input',
          'checked:border-accent checked:bg-accent',
          // The mark, drawn rather than shipped as an icon: one element, no dependency, and it inherits
          // the palette because it is a border on a rotated box.
          'after:absolute after:left-[0.3125rem] after:top-[0.0625rem] after:h-2 after:w-1',
          'after:rotate-45 after:border-b-2 after:border-r-2 after:border-accent-foreground',
          'after:opacity-0 checked:after:opacity-100 after:transition-opacity',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
    );

    if (!label) return box;

    return (
      <div className="flex flex-col gap-1">
        <label
          htmlFor={inputId}
          className="flex items-start gap-2 text-sm text-foreground cursor-pointer"
        >
          {box}
          <span className="leading-snug">{label}</span>
        </label>
        {hint && (
          <p id={hintId} className="text-2xs text-muted-foreground leading-relaxed pl-6">
            {hint}
          </p>
        )}
      </div>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
