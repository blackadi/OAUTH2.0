import { useState, Suspense } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from './ErrorBoundary';
import { Menu, X, Bug } from 'lucide-react';
import { SpinnerPage } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { useServerStatus } from '@/hooks/useServerStatus';
import type { SectionGroup } from '@/App';

interface AppLayoutProps {
  groups: SectionGroup[];
  sidebarHeader?: React.ReactNode;
}

function AppLayout({ groups, sidebarHeader }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname;
  const { status, uptime } = useServerStatus();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 bg-transparent border-none cursor-pointer"
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <Bug className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground tracking-tight">OAuth Debugger</span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50"
            title={status === 'connected' ? `Server uptime: ${Math.floor(uptime ?? 0)}s` : 'Server unreachable'}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-colors duration-500',
                status === 'connected' && 'bg-green-500 shadow-sm shadow-green-500/50',
                status === 'disconnected' && 'bg-red-500 shadow-sm shadow-red-500/50',
                status === 'checking' && 'bg-yellow-500 animate-pulse',
              )}
            />
            <span className="text-[0.65rem] text-muted-foreground font-medium uppercase tracking-wider">
              {status === 'connected' && 'Connected'}
              {status === 'disconnected' && 'Offline'}
              {status === 'checking' && 'Checking'}
            </span>
          </div>
          <span className="hidden sm:block text-[0.65rem] text-muted-foreground font-mono">Authlete Node Server</span>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-border bg-card max-h-[60vh] overflow-y-auto">
          <nav className="p-2 space-y-1">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="px-3 py-1.5 text-[0.6rem] font-semibold uppercase tracking-widest text-muted-foreground">
                  {group.label}
                </div>
                {group.sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      navigate(section.path);
                      setMobileMenuOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-left cursor-pointer border-none transition-colors',
                      activePath === section.path
                        ? 'bg-indigo-500/10 text-indigo-300 font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                    )}
                  >
                    <span className="shrink-0 text-current">{section.icon}</span>
                    <span>{section.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar groups={groups} header={sidebarHeader} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 lg:p-6 xl:p-8">
            <ErrorBoundary>
              <Suspense fallback={<SpinnerPage />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}

export { AppLayout };
