import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        // Tokenised, and darkened. Every stop now clears 4.5:1 against white — see the note on
        // `--accent-grad-from` in `globals.css` for the measurements and why neither gate caught it.
        default:
          'bg-gradient-to-r from-accent-grad-from to-accent-grad-to text-accent-foreground hover:from-accent-grad-from-hover hover:to-accent-grad-to-hover',
        secondary: 'bg-transparent border border-border text-foreground hover:bg-muted',
        danger:
          'bg-gradient-to-r from-danger-grad-from to-danger-grad-to text-accent-foreground hover:from-danger-grad-from-hover hover:to-danger-grad-to-hover',
        ghost: 'bg-transparent hover:bg-muted text-foreground',
        outline: 'border border-border bg-transparent hover:bg-muted text-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-full px-3 text-xs',
        lg: 'h-12 rounded-full px-6',
        icon: 'h-9 w-9 rounded-full',
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
