import { cn } from '@/utils/cn';

interface SkeletonProps {
  className?: string;
}

function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <div className="flex gap-2 pt-2">
        {/* Mimics `Button`, so it follows `Button` to square — a skeleton that does not match the shape it
            stands in for is a layout shift waiting to happen. */}
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
    </div>
  );
}

export { Skeleton, SkeletonCard };
