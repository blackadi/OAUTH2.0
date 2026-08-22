import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies default variant', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge.className).toContain('rounded-full');
  });

  it('applies variant class', () => {
    render(<Badge variant="success">Success</Badge>);
    const badge = screen.getByText('Success');
    // Semantic token rather than a shade: the literal was chosen against a near-black ground and
    // could not carry to a white one. See scripts/check-contrast.mjs.
    expect(badge.className).toContain('text-success-text');
  });

  it('applies custom className', () => {
    render(<Badge className="custom-class">Custom</Badge>);
    expect(screen.getByText('Custom').className).toContain('custom-class');
  });
});
