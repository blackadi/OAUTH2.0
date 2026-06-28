import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-indigo-500/20 text-indigo-300',
        success: 'bg-green-500/20 text-green-300',
        danger: 'bg-red-500/20 text-red-300',
        warning: 'bg-yellow-500/20 text-yellow-300',
        info: 'bg-blue-500/20 text-blue-300',
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
