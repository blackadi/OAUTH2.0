import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/utils/cn';
import type { SectionGroup } from '@/App';

interface SidebarProps {
  groups: SectionGroup[];
  header?: React.ReactNode;
}

function Sidebar({ groups, header }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname;

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card hidden lg:flex lg:flex-col">
      <nav className="flex-1 overflow-y-auto p-2 space-y-3">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 py-1.5 text-[0.6rem] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => navigate(section.path)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all duration-150 text-left cursor-pointer border-none',
                    activePath === section.path
                      ? 'bg-indigo-500/10 text-indigo-300 font-medium shadow-sm shadow-indigo-500/5'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <span className={cn(
                    'shrink-0',
                    activePath === section.path ? 'text-indigo-400' : 'text-muted-foreground',
                  )}>
                    {section.icon}
                  </span>
                  <span>{section.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {header && (
        <div className="shrink-0 border-t border-border p-3">
          {header}
        </div>
      )}
    </aside>
  );
}

export { Sidebar };
