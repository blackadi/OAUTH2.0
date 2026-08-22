import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables when loading', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disables when disabled prop set', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('prevents click when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  /**
   * Asserted on the **token names**, not on Tailwind shades.
   *
   * This checked for `red-600`, which pinned the literal gradient — and that gradient failed WCAG AA:
   * white text measured 3.76:1 at its light end and **2.77:1 on hover**, against the 4.5:1 body-text
   * threshold. The stops are tokens now (`--danger-grad-*`, all clearing 4.5:1), and
   * `check-contrast.mjs` scores them against `accent-foreground` on every stop, taking the worst. A test
   * naming a shade would have to be edited every time the palette moved, and would go on passing while
   * the contrast was wrong — which is exactly what happened.
   */
  it('applies variant classes from the palette tokens', () => {
    const { rerender } = render(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button').className).toContain('from-danger-grad-from');
    expect(screen.getByRole('button').className).toContain('hover:to-danger-grad-to-hover');

    rerender(<Button variant="default">Primary</Button>);
    expect(screen.getByRole('button').className).toContain('from-accent-grad-from');

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button').className).toContain('bg-transparent');
  });

  it('applies size classes', () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button').className).toContain('h-8');
  });
});
