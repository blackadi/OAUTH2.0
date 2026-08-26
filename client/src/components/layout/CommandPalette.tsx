import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { searchCommands, type Command } from '@/utils/command-index';
import { cn } from '@/utils/cn';

/**
 * ⌘K — one way in to twenty-two sections and every cited entry in the reading corpus.
 *
 * **The gap it closes.** The sidebar is the only route to a section and it does not fit on screen: 22
 * links plus 4 group headings need 992px of a rail that has 781px, so Admin is permanently below the
 * fold. One level down it is worse — `/reference` renders 24 authorization parameters, 6 token-request
 * parameters, 26 claims, 20 specification error codes, 18 Authlete codes and a glossary, each with its own
 * anchor, and the only way to reach an entry was to know the page existed and scroll it. The corpus was
 * the product's differentiator and its index was a scrollbar.
 *
 * **The ARIA is the APG combobox pattern, and the reason matters.** The options are *not* focusable and
 * focus never leaves the input; the highlighted row is named by `aria-activedescendant`. That is what lets
 * you keep typing while arrowing — the alternative, moving DOM focus onto each row, means every keystroke
 * after the first goes to a `<div>` instead of the query. It also makes the focus trap almost free: there
 * is exactly one focusable element inside the dialog.
 *
 * **Escape, backdrop and route change all close it**, and focus goes back to whatever opened it. A
 * palette that leaves focus in a dismissed dialog strands a keyboard user on nothing.
 */

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** The whole index, assembled by the owner so actions can carry live callbacks. */
  commands: Command[];
  /** Navigate to a `to`. Passed in rather than using `useNavigate` so this file needs no router. */
  onNavigate: (to: string) => void;
}

/** Unmounted while closed, so the query, the selection and the scroll position cannot go stale. */
function CommandPalette({ open, onClose, commands, onNavigate }: CommandPaletteProps) {
  if (!open) return null;
  return <CommandPalettePanel onClose={onClose} commands={commands} onNavigate={onNavigate} />;
}

function CommandPalettePanel({ onClose, commands, onNavigate }: Omit<CommandPaletteProps, 'open'>) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Where focus was before this opened, so it can be given back — as `ConfirmDialog` does. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const listId = useId();
  const labelId = useId();

  const { groups, flat } = useMemo(() => searchCommands(query, commands), [query, commands]);

  /*
    Clamped on read rather than reset in an effect.

    The selection has to survive the list changing under it on every keystroke, and the tempting fix —
    an effect that sets it back to 0 when `flat.length` changes — is a synchronous `setState` in an effect
    body, which is the cascading render `react-hooks/set-state-in-effect` rejects and which `ConfirmDialog`
    documents avoiding by unmounting. Deriving the safe index at render time cannot go out of step with
    the list it indexes into.
  */
  const index = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);
  const selected = index >= 0 ? flat[index] : undefined;

  const run = useCallback(
    (command: Command) => {
      // Closed first, so a command that moves focus is not fighting the focus restore below.
      onClose();
      if (command.run) command.run();
      else if (command.to) onNavigate(command.to);
    },
    [onClose, onNavigate],
  );

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const previous = returnFocusRef.current;
    return () => previous?.focus?.();
  }, []);

  /**
   * Keep the highlighted row in view when it moved because of a key rather than a pointer.
   *
   * No `CSS.escape`: every id here is `<kind>-<identifier>` where the identifier comes from a
   * specification — claim names, parameter names, error codes, section ids — so the character set is
   * `[A-Za-z0-9_-]` and there is nothing to escape. `scrollIntoView` is optional-called for the reason
   * `useHashScroll` documents: jsdom does not implement it, and an unguarded call is a crash in tests
   * rather than a missing scroll.
   */
  useEffect(() => {
    if (!selected) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-command-id="${selected.id}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        // Wrapping, because a list this long is faster to reach from the other end.
        setActive(flat.length === 0 ? 0 : (index + 1 + flat.length) % flat.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(flat.length === 0 ? 0 : (index - 1 + flat.length) % flat.length);
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(Math.max(0, flat.length - 1));
        break;
      case 'Enter':
        if (selected) {
          event.preventDefault();
          run(selected);
        }
        break;
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
      case 'Tab':
        // There is one focusable element in here. Trapping is therefore a single `preventDefault` rather
        // than the first/last dance `HelpPopover` needs, and Tab keeps the query where you can edit it.
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center p-4 pt-[10vh] bg-background/70 backdrop-blur-sm"
      // A click on the backdrop dismisses; a click inside must not. Dismissing is the safe outcome, so
      // the backdrop is allowed to be the easy target — the same call `ConfirmDialog` makes.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="w-full max-w-xl flex flex-col min-h-0 max-h-[70vh] rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <label id={labelId} htmlFor={`${listId}-input`} className="sr-only">
            Search sections, parameters, claims and error codes
          </label>
          <input
            id={`${listId}-input`}
            ref={inputRef}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={selected ? `${listId}-${selected.id}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // Back to the top on a new query: the previous highlight belonged to a different list.
              setActive(0);
            }}
            placeholder="Jump to a section, a claim, a parameter, an error code…"
            className="flex-1 min-w-0 bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="hidden sm:block shrink-0 text-2xs font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">
            esc
          </kbd>
        </div>

        {/*
          The listbox is always present and the empty message is its *sibling*, which is an ARIA
          constraint rather than a layout preference. A `listbox` may only contain `option` and `group`,
          so a paragraph inside it trips `aria-required-children`; and moving the id onto a conditionally
          rendered element would leave the combobox's `aria-controls` pointing at nothing, which trips
          `aria-valid-attr-value`. An empty listbox is valid. Both rules are in the WCAG set axe runs
          here, so either mistake would have failed the sweep on all 22 routes.
        */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto py-1">
          <div id={listId} role="listbox" aria-label="Results">
            {groups.map((group) => (
              <div key={group.kind} role="group" aria-label={group.label}>
                {/* `aria-hidden`, because the group already carries this string as its accessible name
                    and a bare paragraph is not an allowed child of a group inside a listbox. */}
                <p
                  aria-hidden="true"
                  className="px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  {group.label}
                </p>
                {group.commands.map((command) => {
                  const isActive = command.id === selected?.id;
                  return (
                    <div
                      key={command.id}
                      id={`${listId}-${command.id}`}
                      data-command-id={command.id}
                      role="option"
                      aria-selected={isActive}
                      /* `onMouseDown`, not `onClick`: the backdrop dismisses on mousedown, and a click
                         handler here would not have fired yet when it does. */
                      onMouseDown={(event) => {
                        event.preventDefault();
                        run(command);
                      }}
                      onMouseMove={() => setActive(flat.indexOf(command))}
                      className={cn(
                        'flex items-baseline gap-2 px-3 py-1.5 cursor-pointer',
                        isActive ? 'bg-tint-accent' : 'hover:bg-muted/40',
                      )}
                    >
                      <span
                        className={cn(
                          'font-mono text-xs shrink-0',
                          isActive ? 'text-accent-text' : 'text-foreground',
                        )}
                      >
                        {command.title}
                      </span>
                      {command.subtitle && (
                        <span className="text-2xs text-muted-foreground truncate">
                          {command.subtitle}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {flat.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing matches <span className="font-mono text-foreground">{query}</span>. This
              searches the 22 sections plus every cited entry in the reference — parameters, claims,
              OAuth error codes and Authlete codes.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border shrink-0 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> open
          </span>
          <span>↑↓ move</span>
          <span className="ml-auto font-mono tabular-nums">
            {flat.length} {flat.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { CommandPalette };
