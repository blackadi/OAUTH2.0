import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '@/components/ui/Checkbox';

/**
 * The primitive exists to end eight hand-rolled checkboxes, so what is asserted here is the part each
 * of those got wrong: the wiring. The drawn mark is CSS and jsdom cannot see it — a screenshot is the
 * only honest check for that, and the visual suite carries it.
 */
describe('Checkbox', () => {
  it('renders a real checkbox in the accessibility tree', () => {
    render(<Checkbox label="Sender-constrain with DPoP" />);
    expect(
      screen.getByRole('checkbox', { name: 'Sender-constrain with DPoP' }),
    ).toBeInTheDocument();
  });

  it('wires the label to the input, so clicking the words toggles the box', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Use PAR" />);
    const box = screen.getByRole('checkbox');
    expect(box).not.toBeChecked();
    await user.click(screen.getByText('Use PAR'));
    expect(box).toBeChecked();
  });

  it('points the input at its hint, which is the half a bespoke checkbox always drops', () => {
    render(<Checkbox label="Use PAR" hint="Pushes the request server-side first." />);
    const box = screen.getByRole('checkbox');
    const hintId = box.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId as string)).toHaveTextContent(
      'Pushes the request server-side first.',
    );
  });

  it('renders the box alone when there is no label, for a call site that owns its own layout', () => {
    const { container } = render(<Checkbox aria-label="bare" />);
    expect(container.querySelector('label')).toBeNull();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('lets a call site override the size without losing the token styling', () => {
    render(<Checkbox aria-label="small" className="w-3.5 h-3.5" />);
    const cls = screen.getByRole('checkbox').className;
    expect(cls).toContain('w-3.5');
    expect(cls).not.toContain('w-4');
    expect(cls).toContain('checked:bg-accent');
  });
});
