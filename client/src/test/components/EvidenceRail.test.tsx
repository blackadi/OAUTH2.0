import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { EvidenceRail } from '@/components/layout/EvidenceRail';
import { TokenProvider } from '@/context/TokenContext';
import { RAIL_WIDTH } from '@/services/preferences';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

type Props = Parameters<typeof EvidenceRail>[0];

function renderRail(overrides: Partial<Props> = {}) {
  const props: Props = {
    open: true,
    onClose: vi.fn(),
    tab: 'tokens',
    onTabChange: vi.fn(),
    width: RAIL_WIDTH.default,
    onWidthChange: vi.fn(),
    tokenVault: <div data-testid="vault">the vault</div>,
    traceCount: 0,
    ...overrides,
  };
  render(
    <TokenProvider>
      <EvidenceRail {...props} />
    </TokenProvider>,
  );
  return props;
}

describe('what it shows', () => {
  it('renders nothing when closed', () => {
    renderRail({ open: false });
    expect(screen.queryByRole('complementary', { name: 'Evidence' })).toBeNull();
  });

  it('mounts only the selected tab', () => {
    renderRail({ tab: 'tokens' });
    expect(screen.getByTestId('vault')).toBeInTheDocument();
    /*
      The unmounting is the assertion, not an implementation detail. Keeping all three mounted would put
      the trace's `role="region"` in the tree while the Tokens tab is showing — and `AppLayout` also
      mounts a bottom-sheet trace below `lg:`, so two landmarks with one name is a live risk here rather
      than a theoretical one.
    */
    expect(screen.queryByRole('region', { name: 'Request trace' })).toBeNull();
  });

  it('shows the trace on the trace tab', () => {
    renderRail({ tab: 'trace' });
    expect(screen.getByRole('region', { name: 'Request trace' })).toBeInTheDocument();
    expect(screen.queryByTestId('vault')).toBeNull();
  });

  it('shows the JWS scratchpad on the inspect tab', () => {
    renderRail({ tab: 'inspect' });
    expect(screen.getByLabelText(/Paste any JWS/)).toBeInTheDocument();
  });
});

describe('the tab bar', () => {
  it('puts the request count on the Trace tab, and omits it at zero', () => {
    // The count is on the tab because the trace exists precisely because a non-2xx used to vanish into
    // a toast. A "· 0" would be noise; a "· 7" is the reason to look.
    renderRail({ traceCount: 0 });
    expect(screen.getByRole('tab', { name: 'Trace' })).toBeInTheDocument();
    cleanup();
    renderRail({ traceCount: 7 });
    expect(screen.getByRole('tab', { name: 'Trace · 7' })).toBeInTheDocument();
  });

  it('reports the selected tab through aria-selected', () => {
    renderRail({ tab: 'inspect' });
    expect(screen.getByRole('tab', { name: 'Inspect' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Tokens' })).toHaveAttribute('aria-selected', 'false');
  });

  it('asks its owner to change tab rather than holding the selection itself', async () => {
    const props = renderRail({ tab: 'tokens' });
    await userEvent.click(screen.getByRole('tab', { name: 'Inspect' }));
    expect(props.onTabChange).toHaveBeenCalledWith('inspect');
  });
});

describe('closing', () => {
  it('has one close control, named distinctly from the header toggle', async () => {
    /*
      The header carries a toggle labelled "Hide the evidence rail" whenever the rail is open. This
      control does the same thing from inside the panel, so it must not share that name — two buttons
      with one accessible name and one action is an ambiguity a screen-reader user cannot resolve, and it
      is exactly what shipped until a Playwright strict-mode violation found it.
    */
    const props = renderRail();
    const close = screen.getByRole('button', { name: 'Close the evidence rail' });
    expect(screen.queryByRole('button', { name: 'Hide the evidence rail' })).toBeNull();
    await userEvent.click(close);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the resize handle', () => {
  it('carries the full splitter contract', () => {
    renderRail({ width: 420 });
    const handle = screen.getByRole('separator', { name: 'Resize the evidence rail' });
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-valuenow', '420');
    expect(handle).toHaveAttribute('aria-valuemin', String(RAIL_WIDTH.min));
    expect(handle).toHaveAttribute('aria-valuemax', String(RAIL_WIDTH.max));
    // Focusable, or the key bindings below are unreachable.
    expect(handle).toHaveAttribute('tabindex', '0');
  });

  it('grows leftwards and shrinks rightwards, because that is the direction it moves', async () => {
    const props = renderRail({ width: 400 });
    const handle = screen.getByRole('separator', { name: 'Resize the evidence rail' });
    handle.focus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(props.onWidthChange).toHaveBeenLastCalledWith(416);
    await userEvent.keyboard('{ArrowRight}');
    expect(props.onWidthChange).toHaveBeenLastCalledWith(384);
  });

  it('takes a bigger step with Shift', async () => {
    const props = renderRail({ width: 400 });
    screen.getByRole('separator', { name: 'Resize the evidence rail' }).focus();
    await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(props.onWidthChange).toHaveBeenLastCalledWith(448);
  });

  it('clamps at both ends instead of reporting a width it cannot render', async () => {
    const atMin = renderRail({ width: RAIL_WIDTH.min });
    screen.getByRole('separator', { name: 'Resize the evidence rail' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(atMin.onWidthChange).toHaveBeenLastCalledWith(RAIL_WIDTH.min);

    cleanup();
    const atMax = renderRail({ width: RAIL_WIDTH.max });
    screen.getByRole('separator', { name: 'Resize the evidence rail' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(atMax.onWidthChange).toHaveBeenLastCalledWith(RAIL_WIDTH.max);
  });

  it('ignores keys that are not the two it handles', async () => {
    const props = renderRail();
    screen.getByRole('separator', { name: 'Resize the evidence rail' }).focus();
    await userEvent.keyboard('{ArrowUp}{Enter}a');
    expect(props.onWidthChange).not.toHaveBeenCalled();
  });

  /**
   * The drag path, not just the keyboard one — `onPointerDown` had no test at all. It tracks the
   * pointer against the *window's* right edge rather than a delta from the drag's start, which is the
   * point of the design note above it: this is the assertion that the handle actually reports
   * `window.innerWidth - clientX`, not merely that pressing it does something.
   */
  describe('dragging', () => {
    const setPointerCapture = vi.fn();
    // jsdom does not implement `setPointerCapture` at all — calling the real (absent) method throws.
    beforeAll(() => {
      Element.prototype.setPointerCapture = setPointerCapture;
    });

    it('captures the pointer and reports width from the window edge on move', () => {
      const props = renderRail();
      const handle = screen.getByRole('separator', { name: 'Resize the evidence rail' });

      fireEvent.pointerDown(handle, { pointerId: 7 });
      expect(setPointerCapture).toHaveBeenCalledWith(7);

      Object.defineProperty(window, 'innerWidth', { writable: true, value: 1200 });
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 800 }));
      expect(props.onWidthChange).toHaveBeenCalledWith(400);
    });

    it('stops reporting width once the pointer is released', () => {
      const props = renderRail();
      const handle = screen.getByRole('separator', { name: 'Resize the evidence rail' });

      fireEvent.pointerDown(handle, { pointerId: 1 });
      window.dispatchEvent(new PointerEvent('pointerup'));
      vi.mocked(props.onWidthChange).mockClear();

      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 500 }));
      expect(props.onWidthChange).not.toHaveBeenCalled();
    });

    it('clamps the reported width at both ends', () => {
      const props = renderRail();
      const handle = screen.getByRole('separator', { name: 'Resize the evidence rail' });
      Object.defineProperty(window, 'innerWidth', { writable: true, value: 1200 });

      fireEvent.pointerDown(handle, { pointerId: 1 });
      // A huge clientX makes the rail's implied width negative — clamped to the minimum, not negative.
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 1190 }));
      expect(props.onWidthChange).toHaveBeenLastCalledWith(RAIL_WIDTH.min);

      // clientX at 0 makes the implied width the full window — clamped to the maximum.
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0 }));
      expect(props.onWidthChange).toHaveBeenLastCalledWith(RAIL_WIDTH.max);
    });
  });
});
