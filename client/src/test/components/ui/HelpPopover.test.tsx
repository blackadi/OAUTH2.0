import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { HelpPopover } from '@/components/ui/HelpPopover';

/**
 * The per-parameter help panel — a `position: fixed` portal that is the *only* route to the content it
 * holds, which is exactly why its one documented historical bug mattered: on a viewport shorter than
 * ~504px the old fixed-480px panel clamped its `top` to a positive number while keeping a 480px height,
 * so the panel's bottom sat off-screen with no scroll container sized to reach it. `computePosition`'s
 * viewport-relative clamp is what fixed that, and it had no test — everything below it (open/close,
 * escape, outside-click, the focus trap) also had none.
 */

afterEach(cleanup);

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

/** The trigger button always reports a plausible position; only the viewport varies per test. */
function stubTriggerRect() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 40,
    bottom: 60,
    left: 20,
    right: 40,
    width: 20,
    height: 20,
    x: 20,
    y: 40,
    toJSON: () => ({}),
  });
}

describe('HelpPopover — open, close and content', () => {
  it('starts closed, with the trigger reporting so', () => {
    render(<HelpPopover title="scope" description="What this parameter does." />);
    const trigger = screen.getByRole('button', { name: /Help/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on click and renders the title, description, params, returns and tips', () => {
    setViewport(1280, 900);
    stubTriggerRect();
    render(
      <HelpPopover
        title="scope"
        description="Which permissions the client is asking for."
        params={[{ name: 'scope', desc: 'Space-separated list.' }]}
        returns="A token whose grant is limited to what was requested."
        tips="Ask for the narrowest scope your client actually needs."
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Help/i }));

    const dialog = screen.getByRole('dialog', { name: 'scope' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Which permissions the client is asking for/i)).toBeInTheDocument();
    expect(screen.getByText('scope', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText(/Space-separated list/i)).toBeInTheDocument();
    expect(screen.getByText(/A token whose grant is limited/i)).toBeInTheDocument();
    expect(screen.getByText(/Ask for the narrowest scope/i)).toBeInTheDocument();
  });

  it('omits the Parameters, Returns and Tips sections entirely when none are given', () => {
    setViewport(1280, 900);
    stubTriggerRect();
    render(<HelpPopover title="scope" description="Bare minimum." />);
    fireEvent.click(screen.getByRole('button', { name: /Help/i }));

    expect(screen.queryByText('Parameters')).not.toBeInTheDocument();
    expect(screen.queryByText('Returns')).not.toBeInTheDocument();
    expect(screen.queryByText('Tips')).not.toBeInTheDocument();
  });

  it('moves focus onto the panel on open, and back to the trigger on close', async () => {
    setViewport(1280, 900);
    stubTriggerRect();
    render(<HelpPopover title="scope" description="…" />);
    const trigger = screen.getByRole('button', { name: /Help/i });
    fireEvent.click(trigger);

    await waitFor(() => expect(document.activeElement).not.toBe(trigger));

    fireEvent.click(screen.getByRole('button', { name: /Close help/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    setViewport(1280, 900);
    stubTriggerRect();
    render(<HelpPopover title="scope" description="…" />);
    const trigger = screen.getByRole('button', { name: /Help/i });
    fireEvent.click(trigger);
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a click outside the panel and the trigger', async () => {
    setViewport(1280, 900);
    stubTriggerRect();
    render(
      <div>
        <div data-testid="outside">elsewhere on the page</div>
        <HelpPopover title="scope" description="…" />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Help/i }));
    await screen.findByRole('dialog');

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not close on a click inside the panel itself', async () => {
    setViewport(1280, 900);
    stubTriggerRect();
    render(<HelpPopover title="scope" description="Click me, I am inside." />);
    fireEvent.click(screen.getByRole('button', { name: /Help/i }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.mouseDown(dialog);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

/**
 * The focus trap — with a single-parameter popover there are exactly two focusable elements (the close
 * button and, once opened, whatever is inside), so Tab from the last must wrap to the first and Shift+Tab
 * from the first must wrap to the last. This is what keeps a `position: fixed` modal from leaking focus
 * onto the page behind it.
 */
describe('HelpPopover — the focus trap', () => {
  it('wraps Tab from the last focusable element back to the first', async () => {
    setViewport(1280, 900);
    stubTriggerRect();
    render(
      <HelpPopover title="scope" description="No links, no params — just the close button." />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Help/i }));
    const dialog = await screen.findByRole('dialog');
    const close = screen.getByRole('button', { name: /Close help/i });

    // The only focusable element inside this panel is the close button itself, so it is both the first
    // and the last — Tab from it must not escape the dialog.
    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });

    expect(document.activeElement).toBe(close);
  });

  it('wraps Shift+Tab from the first focusable element to the last', async () => {
    setViewport(1280, 900);
    stubTriggerRect();
    render(<HelpPopover title="scope" description="…" />);
    fireEvent.click(screen.getByRole('button', { name: /Help/i }));
    const dialog = await screen.findByRole('dialog');
    const close = screen.getByRole('button', { name: /Close help/i });

    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(close);
  });
});

/**
 * `computePosition`'s viewport-relative clamp — the historical bug. Not exported, so driven through the
 * rendered inline style, which is the only observable surface for it.
 */
describe('HelpPopover — position clamps to what the viewport actually has', () => {
  it('never asks for more height than a short viewport has, and never goes above MARGIN', async () => {
    // A landscape phone, ~375px tall — the exact case the bug's own comment names.
    setViewport(700, 375);
    stubTriggerRect();
    render(<HelpPopover title="scope" description="…" />);
    fireEvent.click(screen.getByRole('button', { name: /Help/i }));
    const dialog = await screen.findByRole('dialog');

    const top = parseFloat(dialog.style.top);
    const maxHeight = parseFloat(dialog.style.maxHeight);

    // The panel must fit within the viewport height minus its own top offset and the bottom margin —
    // the exact inequality the old fixed-480 version violated.
    expect(top + maxHeight).toBeLessThanOrEqual(375 - 12 + 0.5); // MARGIN = 12, epsilon for float math
    expect(top).toBeGreaterThanOrEqual(12);
    // And still tall enough to be legible — MIN_HEIGHT's floor.
    expect(maxHeight).toBeGreaterThanOrEqual(160);
  });

  it('fits comfortably below the trigger on an ordinary desktop viewport, at the preferred height', async () => {
    setViewport(1440, 900);
    stubTriggerRect();
    render(<HelpPopover title="scope" description="…" />);
    fireEvent.click(screen.getByRole('button', { name: /Help/i }));
    const dialog = await screen.findByRole('dialog');

    expect(parseFloat(dialog.style.maxHeight)).toBe(480);
    // Below the trigger (bottom = 60, GAP = 6), not flipped above it.
    expect(parseFloat(dialog.style.top)).toBe(66);
  });

  it('flips above the trigger when there is no room below but there is above', async () => {
    setViewport(1440, 500);
    // A trigger near the bottom of a mid-height viewport: nothing fits below it, plenty fits above.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 450,
      bottom: 470,
      left: 20,
      right: 40,
      width: 20,
      height: 20,
      x: 20,
      y: 450,
      toJSON: () => ({}),
    });
    render(<HelpPopover title="scope" description="…" />);
    fireEvent.click(screen.getByRole('button', { name: /Help/i }));
    const dialog = await screen.findByRole('dialog');

    // Placed above: top is well before the trigger's own top (450).
    expect(parseFloat(dialog.style.top)).toBeLessThan(450);
  });
});
