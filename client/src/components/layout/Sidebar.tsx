import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/utils/cn';
import type { SectionGroup } from '@/App';

interface SidebarProps {
  groups: SectionGroup[];
  header?: React.ReactNode;
}

/**
 * Navigation uses links, not buttons.
 *
 * These were `<button onClick={navigate}>`, which works with a mouse and loses everything else a link
 * gives you: no middle-click, no open-in-new-tab, no copy-link, no `aria-current` for the page you are
 * on, and a screen reader announcing twenty "buttons" where a list of links was meant.
 */
function Sidebar({ groups, header }: SidebarProps) {
  const location = useLocation();
  const activePath = location.pathname;

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card hidden lg:flex lg:flex-col">
      <nav className="flex-1 overflow-y-auto p-2 space-y-3">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.sections.map((section) => (
                <Link
                  key={section.id}
                  to={section.path}
                  aria-current={activePath === section.path ? 'page' : undefined}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all duration-150 text-left cursor-pointer border-none no-underline',
                    activePath === section.path
                      ? 'bg-tint-accent text-accent-text font-medium shadow-sm shadow-indigo-500/5'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'shrink-0',
                      activePath === section.path ? 'text-accent-text' : 'text-muted-foreground',
                    )}
                  >
                    {section.icon}
                  </span>
                  <span>{section.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {header && <div className="shrink-0 border-t border-border p-3">{header}</div>}
    </aside>
  );
}

export { Sidebar };
