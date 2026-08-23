import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-tint-accent-strong text-accent-text',
        success: 'bg-tint-success-strong text-success-text',
        danger: 'bg-tint-danger-strong text-danger-text',
        warning: 'bg-tint-warning-strong text-warning-text',
        info: 'bg-tint-info-strong text-info-text',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  className?: string;
  children: React.ReactNode;
}

function Badge({ className, variant, children }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}

export { Badge, badgeVariants };
