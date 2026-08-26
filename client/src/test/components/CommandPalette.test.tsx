import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CommandPalette } from '@/components/layout/CommandPalette';
import type { Command } from '@/utils/command-index';

afterEach(cleanup);

const COMMANDS: Command[] = [
  { id: 'action-theme', kind: 'action', title: 'Switch the theme', run: vi.fn() },
  {
    id: 'section-auth-flows',
    kind: 'section',
    title: 'Grant Flows',
    subtitle: 'OAuth 2.0',
    to: '/auth-flows',
  },
  {
    id: 'section-token-ops',
    kind: 'section',
    title: 'Token Operations',
    subtitle: 'OAuth 2.0',
    to: '/token-ops',
  },
  {
    id: 'claim-nonce',
    kind: 'claim',
    title: 'nonce',
    subtitle: 'Nonce · OIDC Core §3.1.2.1',
    detail: 'Binds the ID token to this request.',
    to: '/reference#claim-nonce',
  },
];

function renderPalette(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    commands: COMMANDS,
    onNavigate: vi.fn(),
    ...overrides,
  };
  render(<CommandPalette {...props} />);
  return props;
}

const input = () => screen.getByRole('combobox');

describe('what it shows', () => {
  it('renders nothing while closed', () => {
    renderPalette({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers somewhere to go before anything is typed', () => {
    renderPalette();
    // Actions and sections only — the reference corpus is 100+ entries and an unfiltered dump of it is
    // not a starting point.
    expect(screen.getByRole('option', { name: /Grant Flows/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /nonce/ })).toBeNull();
  });

  it('focuses the query on open, so you can type immediately', () => {
    renderPalette();
    expect(input()).toHaveFocus();
  });

  it('narrows as you type, across every corpus', async () => {
    renderPalette();
    await userEvent.type(input(), 'nonce');
    expect(screen.getByRole('option', { name: /nonce/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Grant Flows/ })).toBeNull();
  });

  it('says what it searches when nothing matches', async () => {
    renderPalette();
    await userEvent.type(input(), 'zzzznothing');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    // Naming the corpora turns a dead end into an explanation of what this box is for.
    expect(screen.getByText(/searches the 22 sections/)).toBeInTheDocument();
  });
});

describe('the ARIA contract', () => {
  /**
   * The APG combobox pattern, and each of these is load-bearing rather than decorative.
   *
   * Options are **not** focusable and focus never leaves the input; the highlighted row is named through
   * `aria-activedescendant`. That is what lets you keep typing while arrowing — move DOM focus onto each
   * row instead and every keystroke after the first goes to a `<div>`.
   */
  it('names the highlighted row through aria-activedescendant', async () => {
    renderPalette();
    const listbox = screen.getByRole('listbox');
    expect(input()).toHaveAttribute('aria-controls', listbox.id);
    expect(input()).toHaveAttribute('aria-expanded', 'true');

    const first = screen.getAllByRole('option')[0];
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', first.id);

    await userEvent.keyboard('{ArrowDown}');
    const second = screen.getAllByRole('option')[1];
    expect(input()).toHaveAttribute('aria-activedescendant', second.id);
    expect(input()).toHaveFocus();
  });

  it('drops aria-activedescendant when there is nothing to point at', async () => {
    renderPalette();
    await userEvent.type(input(), 'zzzznothing');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
  });

  it('keeps the listbox mounted and empty rather than removing it', async () => {
    /*
      Two ARIA rules pull in opposite directions and this is the shape that satisfies both: a `listbox`
      may only contain `option` and `group`, so the "nothing matches" paragraph has to live outside it;
      and `aria-controls` must point at a real element, so the listbox cannot be conditionally rendered.
      An empty listbox is valid. Both rules are in the WCAG set the axe sweep runs on all 22 routes.
    */
    renderPalette();
    await userEvent.type(input(), 'zzzznothing');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(listbox.querySelector('p')).toBeNull();
  });

  it('groups results and labels each group', async () => {
    renderPalette();
    await userEvent.type(input(), 'grant');
    expect(screen.getByRole('group', { name: 'Go to' })).toBeInTheDocument();
  });
});

describe('the keyboard', () => {
  it('wraps at both ends', async () => {
    renderPalette();
    const options = () => screen.getAllByRole('option');
    const activeId = () => input().getAttribute('aria-activedescendant');

    const first = options()[0].id;
    const last = options()[options().length - 1].id;

    await userEvent.keyboard('{ArrowUp}');
    // Up from the first goes to the last: a long list is faster to reach from the other end.
    expect(activeId()).toBe(last);
    await userEvent.keyboard('{ArrowDown}');
    expect(activeId()).toBe(first);
  });

  it('jumps to the ends with Home and End', async () => {
    renderPalette();
    const options = screen.getAllByRole('option');
    await userEvent.keyboard('{End}');
    expect(input()).toHaveAttribute('aria-activedescendant', options[options.length - 1].id);
    await userEvent.keyboard('{Home}');
    expect(input()).toHaveAttribute('aria-activedescendant', options[0].id);
  });

  it('navigates on Enter, and closes first', async () => {
    const props = renderPalette();
    await userEvent.type(input(), 'nonce');
    await userEvent.keyboard('{Enter}');
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onNavigate).toHaveBeenCalledWith('/reference#claim-nonce');
  });

  it('runs an action instead of navigating, when the command carries one', async () => {
    const props = renderPalette();
    await userEvent.type(input(), 'theme');
    await userEvent.keyboard('{Enter}');
    expect(COMMANDS[0].run).toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it('does nothing on Enter when nothing matched', async () => {
    const props = renderPalette();
    await userEvent.type(input(), 'zzzznothing');
    await userEvent.keyboard('{Enter}');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const props = renderPalette();
    await userEvent.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside, on the query', async () => {
    // One focusable element in the dialog, so the trap is a single `preventDefault` — and Tab leaving for
    // the page behind a modal is the classic focus-trap failure.
    renderPalette();
    await userEvent.tab();
    expect(input()).toHaveFocus();
  });

  it('returns the selection to the top when the query changes', async () => {
    /*
      The previous highlight belonged to a different list. Without this, arrowing down twice and then
      typing another character leaves the highlight on whatever now happens to be third — and Enter opens
      something the reader never looked at.
    */
    renderPalette();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await userEvent.type(input(), 'o');
    const options = screen.getAllByRole('option');
    expect(input()).toHaveAttribute('aria-activedescendant', options[0].id);
  });

  it('survives the list shrinking under the selection', async () => {
    // The clamp exists because the alternative — resetting the index in an effect — is the cascading
    // render `react-hooks/set-state-in-effect` rejects.
    renderPalette();
    await userEvent.keyboard('{End}');
    await userEvent.type(input(), 'nonce');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(input()).toHaveAttribute('aria-activedescendant', options[0].id);
  });
});

describe('the pointer', () => {
  it('opens a row on mousedown, not click', async () => {
    /*
      `mousedown`, because the backdrop dismisses on `mousedown` too — a `click` handler on the row would
      not have fired yet when the dialog unmounts, so every click would dismiss without doing anything.
    */
    const props = renderPalette();
    await userEvent.type(input(), 'nonce');
    const option = screen.getByRole('option', { name: /nonce/ });
    await userEvent.pointer({ target: option, keys: '[MouseLeft>]' });
    expect(props.onNavigate).toHaveBeenCalledWith('/reference#claim-nonce');
  });

  it('follows the pointer with the highlight', async () => {
    renderPalette();
    const options = screen.getAllByRole('option');
    await userEvent.pointer({ target: options[1], coords: { x: 1, y: 1 } });
    expect(input()).toHaveAttribute('aria-activedescendant', options[1].id);
  });
});
