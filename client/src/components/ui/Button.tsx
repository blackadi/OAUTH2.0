import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';
import { Loader2 } from 'lucide-react';

/**
 * The button, under the converged rule: **colour carries meaning, never rank.**
 *
 * This primitive was where the incumbent system contradicted itself. `default` was a filled indigo
 * gradient, so the loudest object on any screen was whichever control the page considered most
 * important — while the five semantic roles beside it (`success`, `warning`, `danger`, `info`,
 * `accent`) were reserved for what the *server* said. Two colour systems ran at once: one for meaning,
 * one for rank, sharing a hue. In a debugger, that trains the reader to discount the only colour that
 * carries information.
 *
 * So rank comes off colour. Primary is now ink and a solid offset — heavier, not brighter — and the
 * accent gradient is gone. Nothing here fills except one variant, below.
 *
 * **The one exception, and it is a rule rather than an oversight: `danger` stays filled.** Destroying a
 * token or revoking a grant is not a rank, it is a meaning, and it is the one action in this
 * application that cannot be undone. Exactly one filled control exists, and it is the one that takes
 * something away. Everything else earns attention by weight.
 *
 * **Shape.** Square-ish (2px) rather than a pill. Both of the directions built for this app — the
 * transcript for content, the register for chrome — landed on near-square independently, because a
 * document and a logbook are ruled rectangles; the pill was the incumbent's shadcn default and was
 * never argued for. This is the convergence, so this is where it changes.
 *
 * **Contrast.** The gradient stops that `globals.css` measured by hand are still tokens and still used
 * by `danger`, so its white-on-red is the pairing that was proven to clear 4.5:1 at every stop. The new
 * ink variants are foreground-on-transparent, which `check:contrast` scores directly.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-[color,border-color,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        // Weight, not brightness. The offset deepens on hover, which reads as "pressed" the way the
        // darkening gradient did, without spending the accent on rank.
        default:
          'bg-transparent border border-foreground text-foreground shadow-[1px_1px_0_0_var(--foreground)] hover:shadow-[2px_2px_0_0_var(--foreground)]',
        secondary: 'bg-transparent border border-border text-foreground hover:bg-muted',
        // The only filled control in the application. See the note above.
        danger:
          'bg-gradient-to-r from-danger-grad-from to-danger-grad-to text-accent-foreground hover:from-danger-grad-from-hover hover:to-danger-grad-to-hover',
        ghost: 'bg-transparent hover:bg-muted text-foreground',
        outline: 'border border-border bg-transparent hover:bg-muted text-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
