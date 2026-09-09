import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { TabBar, tabPanelProps } from '@/components/ui/TabBar';

/**
 * The primitive's own tests, because the defect they cover was the primitive's.
 *
 * `TabBar` has thirteen call sites across twelve files, and **eleven sections pass a `value` that is
 * `null` on arrival** — `useUrlState` with no fallback, deliberately, because none of their tabs is
 * the obvious default. The tab-stop condition read `value === op.value` alone, so for every one of
 * those the whole tab list had no keyboard entry point. Asserting it here rather than in eleven
 * section tests is the difference between one contract and eleven copies of it.
 */

const OPS = [
  { value: 'a' as const, label: 'Alpha' },
  { value: 'b' as const, label: 'Beta' },
  { value: 'c' as const, label: 'Gamma' },
];

afterEach(cleanup);

/** Exactly one tab may be in the tab sequence — that is what makes the arrow keys the way across. */
const tabStops = () =>
  screen
    .getAllByRole('tab')
    .filter((t) => t.tabIndex === 0)
    .map((t) => t.textContent);

describe('TabBar — the keyboard can always reach the tabs', () => {
  it('gives the first tab the tab stop when nothing is selected', () => {
    render(<TabBar options={OPS} value={null} onChange={vi.fn()} />);
    // The regression: this used to be [] — every tab at -1, the list unreachable.
    expect(tabStops()).toEqual(['Alpha']);
  });

  it('moves the tab stop to the selection once there is one', () => {
    render(<TabBar options={OPS} value="c" onChange={vi.fn()} />);
    expect(tabStops()).toEqual(['Gamma']);
  });

  it('never exposes more than one tab stop', () => {
    for (const value of [null, 'a', 'b', 'c'] as const) {
      cleanup();
      render(<TabBar options={OPS} value={value} onChange={vi.fn()} />);
      expect(tabStops(), `value=${String(value)}`).toHaveLength(1);
    }
  });

  /**
   * A disabled tab list advertises no tab stop.
   *
   * The first-tab clause above, applied blindly, put `tabindex="0"` on a *disabled* button — which no
   * browser will focus anyway, but the light-palette gate reads the attribute and reported the
   * disabled `Create` tab on `/admin` and `List` / `List Auth` on `/client-mgmt` as controls with no
   * focus indicator. `AdminSection` and `ClientManagementSection` both pass `disabled={!auth}`, so
   * this is their state until credentials are entered.
   */
  it('advertises no tab stop while the whole list is disabled', () => {
    render(<TabBar options={OPS} value={null} onChange={vi.fn()} disabled />);
    expect(tabStops()).toEqual([]);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('tabindex', '-1');
    }
  });

  it('advertises no tab stop when disabled even with a selection', () => {
    render(<TabBar options={OPS} value="b" onChange={vi.fn()} disabled />);
    expect(tabStops()).toEqual([]);
  });

  it('keeps arrow keys selecting the neighbour', () => {
    const onChange = vi.fn();
    render(<TabBar options={OPS} value="a" onChange={onChange} />);
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    alpha.focus();
    fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('TabBar — the panel it reveals is related to it', () => {
  it('points each tab at the panel and the panel back at the selected tab', () => {
    const panelId = 'demo-panel';
    render(
      <>
        <TabBar options={OPS} value="b" onChange={vi.fn()} panelId={panelId} />
        <div {...tabPanelProps(panelId, 'b')}>content</div>
      </>,
    );

    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe(panelId);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('aria-controls', panelId);
    }
    // The reference has to resolve, not merely exist — an `aria-labelledby` one character off from
    // its tab's `id` renders identically to a correct one.
    const labelledBy = panel.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toBe(screen.getByRole('tab', { name: 'Beta' }));
  });

  it('omits the label reference when nothing is selected rather than dangling it', () => {
    render(
      <>
        <TabBar options={OPS} value={null} onChange={vi.fn()} panelId="p" />
        <div {...tabPanelProps('p', null)}>content</div>
      </>,
    );
    expect(screen.getByRole('tabpanel')).not.toHaveAttribute('aria-labelledby');
    // `aria-controls` still resolves, which is why the caller renders the panel unconditionally.
    expect(document.getElementById('p')).not.toBeNull();
  });

  it('adds no tab stop of its own to the panel', () => {
    render(<div {...tabPanelProps('p', 'a')}>content</div>);
    expect(screen.getByRole('tabpanel')).not.toHaveAttribute('tabindex');
  });

  it('leaves the tabs unwired when no panel is declared', () => {
    render(<TabBar options={OPS} value="a" onChange={vi.fn()} />);
    // Eleven sections are still in this state; a dangling `aria-controls` would be worse than none.
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).not.toHaveAttribute('aria-controls');
    }
  });
});
