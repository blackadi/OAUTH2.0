import { cn } from '@/utils/cn';
import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered';
}

function Card({ className, variant = 'default', ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl bg-card text-card-foreground p-6',
        // Tokenised per palette — see `--shadow-card` in `globals.css`. The literal these replaced was
        // a `slate-900/80` shadow, invisible on the dark ground it was chosen against and a near-black
        // halo on the light one.
        variant === 'default' && 'shadow-card',
        variant === 'elevated' && 'shadow-card-elevated',
        variant === 'bordered' && 'border border-border',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-2', className)} {...props} />;
}

/**
 * The heading level is a prop, because the level depends on where the card sits.
 *
 * A `<Card>` used as a whole page — `CallbackPage` is the only one — needs `<h1>`, and a card nested
 * inside a section needs `<h2>`. Hard-coding `h2` meant no route in the application had an `<h1>` at
 * all, so every page presented a heading tree with no root. Defaulting to `h2` keeps every existing
 * call site rendering exactly what it rendered before.
 */
type HeadingLevel = 'h1' | 'h2' | 'h3';

function CardTitle({
  className,
  as: Tag = 'h2',
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { as?: HeadingLevel }) {
  return <Tag className={cn('text-lg font-semibold', className)} {...props} />;
}

function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('', className)} {...props} />;
}

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex items-center gap-2', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
