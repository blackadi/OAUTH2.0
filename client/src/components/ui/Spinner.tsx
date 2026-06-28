import { cn } from '@/utils/cn';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'default' | 'lg';
}

function Spinner({ className, size = 'default' }: SpinnerProps) {
  const sizeMap = { sm: 'h-4 w-4', default: 'h-6 w-6', lg: 'h-8 w-8' };
  return <Loader2 className={cn('animate-spin text-muted-foreground', sizeMap[size], className)} />;
}

function SpinnerPage() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <Spinner size="lg" />
    </div>
  );
}

export { Spinner, SpinnerPage };
