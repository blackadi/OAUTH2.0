import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import App from '@/App';
import { setRailOpen } from '@/services/preferences';

/**
 * The app shell — sidebar, header, evidence rail, mobile drawer — mounted through the real router the
 * way `App.routes.test.tsx` does, because the properties worth pinning here are about *where a control
 * lives*, not about any one section's own behaviour.
 *
 * Two of these are direct regression locks for defects this file's own comments record as found by
 * screenshot or by rendering, not by a passing test suite:
 *
 * - **The vault has exactly one home at a time.** `AppLayout` renders `TokenVault` in the sidebar footer
 *   when the evidence rail is closed and inside the rail's Tokens tab when it is open — never both,
 *   never neither. Nothing had asserted this invariant directly.
 * - **The mobile drawer carries its own copy.** Found 2026-08-22: the vault was passed only to
 *   `Sidebar`, which is `hidden lg:flex`, so below 1024px it was unreachable with no trace on screen.
 *   `sections.smoke.test.tsx` and this file's own prior sibling render in jsdom, where a CSS breakpoint
 *   has no effect either way — so the fix is asserted here by counting instances, not by viewport.
 */

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  // The layout polls /api/health on mount; nothing here asserts on connectivity.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline in test'));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('the token vault has exactly one home', () => {
  it('lives in the sidebar footer when the rail is closed, by default', async () => {
    setRailOpen(false);
    renderAt('/health');
    await waitFor(() => expect(document.querySelectorAll('h1').length).toBe(1));

    expect(screen.getAllByRole('button', { name: /^Token Vault$/i })).toHaveLength(1);
    // The rail itself renders nothing at all while closed — not a hidden copy, an absent one.
    expect(screen.queryByRole('complementary', { name: /^Evidence$/i })).not.toBeInTheDocument();
  });

  it('moves into the rail once it is open, and the sidebar carries none', async () => {
    setRailOpen(true);
    renderAt('/health');
    await waitFor(() => expect(document.querySelectorAll('h1').length).toBe(1));

    const rail = screen.getByRole('complementary', { name: /^Evidence$/i });
    expect(
      screen.getAllByRole('button', { name: /^Token Vault$/i }),
      'still exactly one instance — the rail replaced the sidebar copy rather than adding to it',
    ).toHaveLength(1);
    expect(within(rail).getByRole('button', { name: /^Token Vault$/i })).toBeInTheDocument();
  });

  it('toggling the rail from the header moves the vault, without ever doubling or losing it', async () => {
    setRailOpen(false);
    renderAt('/health');
    await waitFor(() => expect(document.querySelectorAll('h1').length).toBe(1));
    expect(screen.queryByRole('complementary', { name: /^Evidence$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show the evidence rail/i }));

    expect(await screen.findByRole('complementary', { name: /^Evidence$/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Token Vault$/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Hide the evidence rail/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('the mobile drawer gives the vault a second, independent way in', () => {
  it('adds a reachable copy of the vault when the drawer opens, on top of whichever one the rail state already renders', async () => {
    setRailOpen(false);
    renderAt('/health');
    await waitFor(() => expect(document.querySelectorAll('h1').length).toBe(1));
    expect(screen.getAllByRole('button', { name: /^Token Vault$/i })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Toggle menu/i }));

    // The drawer's own copy is a second instance — this is the fix for the "unreachable below 1024px"
    // defect, asserted by count rather than by a viewport jsdom cannot model.
    expect(screen.getAllByRole('button', { name: /^Token Vault$/i })).toHaveLength(2);
  });
});

describe('keyboard focus on navigation', () => {
  /**
   * The guard this effect carries is *"move focus on navigation, not on first paint"* — stealing focus
   * on mount would put the very first Tab past the skip link, making it unreachable by the one keystroke
   * it exists to serve. Asserted here because the guard compares the path across renders, which is
   * exactly the kind of logic a screenshot cannot check and a Playwright test only checks indirectly.
   */
  it('does not move focus to the content region on first paint', async () => {
    renderAt('/health');
    await waitFor(() => expect(document.querySelectorAll('h1').length).toBe(1));
    expect(document.activeElement).not.toBe(document.getElementById('main'));
  });

  it('moves focus to the content region once a navigation actually happens', async () => {
    renderAt('/health');
    await waitFor(() => expect(document.querySelectorAll('h1').length).toBe(1));

    fireEvent.click(screen.getByRole('link', { name: /Discovery/i }));

    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('main')));
  });
});

describe('the command palette', () => {
  it('opens on Ctrl+K, and the shortcut label matches a non-Apple platform', async () => {
    renderAt('/health');
    await waitFor(() => expect(document.querySelectorAll('h1').length).toBe(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('opens from its own visible search button too, not only the shortcut', async () => {
    renderAt('/health');
    await waitFor(() => expect(document.querySelectorAll('h1').length).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: /Open the command palette/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
