import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmedAction } from '@/hooks/useConfirmedAction';

/**
 * The guard on six irreversible actions, four of which reach the live Authlete service.
 *
 * These tests exist because the *absence* of this component was the defect: `window.confirm` appeared
 * nowhere in the codebase and Client Management offered a free-text client-id field beside an unguarded
 * Delete button, one misclick from permanently removing a client Modules 02 and 03 are built on. So the
 * properties worth pinning are the ones that make the guard real rather than decorative — the action
 * must not run without confirmation, and a typed confirmation must actually gate the button.
 */

afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Delete it"
        body="Gone for good."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names itself to assistive technology through its title and body', () => {
    render(
      <ConfirmDialog
        open
        title="Delete client 4277838306?"
        body="This cannot be undone."
        confirmLabel="Delete client"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Delete client 4277838306?');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
  });

  it('confirms and cancels through the two buttons', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        confirmLabel="Do it"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape, because the safe outcome must be the easy one', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        confirmLabel="Do it"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  describe('requireTyped — the friction that makes you read which object you are destroying', () => {
    function renderTyped(onConfirm = vi.fn()) {
      render(
        <ConfirmDialog
          open
          title="Delete client?"
          body="Permanent."
          confirmLabel="Delete client"
          requireTyped="1523514379"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );
      return {
        onConfirm,
        button: screen.getByRole('button', { name: 'Delete client' }),
        input: screen.getByLabelText(/to confirm/i),
      };
    }

    it('keeps the confirm button disabled until the exact value is typed', () => {
      const { button, input } = renderTyped();
      expect(button).toBeDisabled();

      // A prefix is not the value — the same distinction the `iss` fix is about.
      fireEvent.change(input, { target: { value: '152351437' } });
      expect(button).toBeDisabled();

      // Nor is a superstring.
      fireEvent.change(input, { target: { value: '15235143790' } });
      expect(button).toBeDisabled();

      fireEvent.change(input, { target: { value: '1523514379' } });
      expect(button).toBeEnabled();
    });

    it('does not run the action while the value is wrong', () => {
      const { onConfirm, button, input } = renderTyped();
      fireEvent.change(input, { target: { value: 'nope' } });
      fireEvent.click(button);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('focuses the field on open, so the friction is reachable by keyboard', async () => {
      const { input } = renderTyped();
      await waitFor(() => expect(input).toHaveFocus());
    });

    /**
     * A closed dialog is unmounted rather than hidden, which is what keeps the typed value from
     * surviving into the next open. Getting this wrong would mean a second delete inherits the first
     * one's satisfied confirmation — the button enabled for an object whose id was never typed.
     */
    it('starts empty again after being closed and reopened', () => {
      function Harness() {
        const [open, setOpen] = useState(true);
        return (
          <>
            <button onClick={() => setOpen((o) => !o)}>toggle</button>
            <ConfirmDialog
              open={open}
              title="t"
              body="b"
              confirmLabel="Delete"
              requireTyped="abc"
              onConfirm={vi.fn()}
              onCancel={vi.fn()}
            />
          </>
        );
      }
      render(<Harness />);
      fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'abc' } });
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'toggle' })); // close
      fireEvent.click(screen.getByRole('button', { name: 'toggle' })); // reopen

      expect(screen.getByLabelText(/to confirm/i)).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });
  });
});

describe('useConfirmedAction', () => {
  function Harness({ run }: { run: () => void }) {
    const { confirm, dialog } = useConfirmedAction();
    return (
      <>
        <button
          onClick={() =>
            confirm({
              title: 'Revoke?',
              body: 'Irreversible.',
              confirmLabel: 'Revoke',
              requireTyped: 'grant-1',
              run,
            })
          }
        >
          Revoke grant
        </button>
        {dialog}
      </>
    );
  }

  it('does not run the action until it is confirmed', () => {
    const run = vi.fn();
    render(<Harness run={run} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke grant' }));
    expect(run).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'grant-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs the action exactly once and closes the dialog', () => {
    const run = vi.fn();
    render(<Harness run={run} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke grant' }));
    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'grant-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('runs nothing when cancelled', () => {
    const run = vi.fn();
    render(<Harness run={run} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke grant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
