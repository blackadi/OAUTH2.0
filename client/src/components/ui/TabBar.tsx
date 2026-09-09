import { cn } from '@/utils/cn';

interface TabBarOption<T extends string> {
  value: T;
  label: string;
}

interface TabBarProps<T extends string> {
  options: TabBarOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  /**
   * The `id` of the region these tabs reveal, wired with `tabPanelProps` below.
   *
   * Optional because a tab list whose panel is not marked up is still better than plain buttons, and
   * eleven sections predate this. Where it is given, the tabs and the panel point at each other.
   */
  panelId?: string;
}

/**
 * The DOM id of one tab.
 *
 * Exported only through `tabPanelProps`, so the formula lives here rather than being re-spelled at a
 * call site — a panel whose `aria-labelledby` is one character off from its tab's `id` is a broken
 * reference that renders identically to a correct one.
 */
const tabId = (panelId: string, value: string) => `${panelId}-tab-${value}`;

/**
 * The props the revealed region needs, to be spread on the caller's own wrapper.
 *
 * Without them a screen reader hears "tab, selected", the content changes, and nothing says the two
 * events are related — measured on `/mcp`: `role="tab"` with no `aria-controls`, and **zero**
 * `role="tabpanel"` elements in the page.
 *
 * No `tabIndex`: the APG puts a panel in the tab sequence only when it holds nothing focusable, and
 * every panel in this application holds a field or a button. Adding one would buy a dead tab stop.
 *
 * The caller must render the wrapper **even with nothing selected**, because `aria-controls` pointing
 * at an id that is not in the document is a broken reference rather than an absent one.
 */
function tabPanelProps(panelId: string, selected: string | null) {
  return {
    id: panelId,
    role: 'tabpanel' as const,
    'aria-labelledby': selected ? tabId(panelId, selected) : undefined,
  };
}

/**
 * Which single tab is in the page's tab sequence.
 *
 * A tab list holds exactly one tab stop and the arrow keys move between the rest, so this has to
 * return true for precisely one index. **With nothing selected, that is the first tab.** The condition
 * used to be `value === op.value` alone, which for an unselected list gave *every* tab `-1` and left
 * it with no keyboard entry point whatsoever. Eleven sections call `useUrlState` with no fallback —
 * deliberately, because none of their tabs is the obvious default — so on arrival their whole tab list
 * was unreachable and half of each section's operations had no keyboard route at all. Verified on
 * `/mcp` before the fix: focus went from the Admin Client Secret field straight into the wizard's
 * first input, skipping all three tabs.
 *
 * A whole tab list that is `disabled` holds no tab stop at all. Without that clause the first tab of
 * a disabled list got `tabindex="0"` — harmless to a browser, which will not focus a disabled button
 * either way, but incoherent markup, and the light-palette gate reads that attribute directly: it
 * found the disabled `Create` tab on `/admin` and `List` / `List Auth` on `/client-mgmt` advertising a
 * tab stop they could never honour.
 */
function isTabStop<T extends string>(
  value: T | null,
  option: T,
  index: number,
  disabled?: boolean,
) {
  if (disabled) return false;
  return value === option || (value === null && index === 0);
}

/**
 * A tab list, with the semantics to match.
 *
 * These were plain buttons: a screen reader announced "button" with no indication that they form a set,
 * how many there are, or which is current — the selected state existed only as a background colour.
 * `role="tablist"` plus `aria-selected` gives that for free, and arrow-key navigation is what a tab list
 * is expected to do.
 */
function TabBar<T extends string>({
  options,
  value,
  onChange,
  disabled,
  className,
  label,
  panelId,
}: TabBarProps<T>) {
  const move = (event: React.KeyboardEvent, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    // Follow focus to the newly selected tab, which is what the pattern expects.
    const list = event.currentTarget.parentElement;
    (list?.querySelectorAll('[role="tab"]')[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} role="tablist" aria-label={label}>
      {label && <span className="text-xs text-muted-foreground leading-8">{label}</span>}
      {options.map((op, index) => (
        <button
          key={op.value}
          role="tab"
          id={panelId ? tabId(panelId, op.value) : undefined}
          aria-controls={panelId}
          aria-selected={value === op.value}
          tabIndex={isTabStop(value, op.value, index, disabled) ? 0 : -1}
          onKeyDown={(e) => move(e, index)}
          onClick={() => onChange(op.value)}
          disabled={disabled}
          className={cn(
            'px-2.5 py-1 text-xs rounded-md border cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            value === op.value
              ? 'bg-tint-accent-strong text-accent-text border-edge-accent'
              : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground',
          )}
        >
          {op.label}
        </button>
      ))}
    </div>
  );
}

export { TabBar, tabPanelProps };
export type { TabBarOption };
