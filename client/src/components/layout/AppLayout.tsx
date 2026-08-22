import { useState, Suspense } from 'react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from './ErrorBoundary';
import { Menu, X, Bug, Activity, Sun, Moon, MonitorCog } from 'lucide-react';
import { SpinnerPage } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { useServerStatus } from '@/hooks/useServerStatus';
import { useTraces } from '@/hooks/useTraces';
import { useTheme } from '@/hooks/useTheme';
import { TracePanel } from '@/components/trace/TracePanel';
import type { SectionGroup } from '@/App';

interface AppLayoutProps {
  groups: SectionGroup[];
  sidebarHeader?: React.ReactNode;
}

function AppLayout({ groups, sidebarHeader }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const traces = useTraces();
  const { choice: themeChoice, resolved: themeResolved, cycle: cycleTheme } = useTheme();
  const failures = traces.filter((t) => !t.ok).length;
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname;
  const { status, uptime } = useServerStatus();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Twenty nav items sit between the top of the document and the content. Without this, reaching
          the page by keyboard means tabbing through all of them on every navigation. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-card focus:text-foreground focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
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
            <span className="text-sm font-semibold text-foreground tracking-tight">
              OAuth Debugger
            </span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          {/* Every HTTP call the app makes is recorded by `transport.ts`; this opens the history. The
              failure count is surfaced on the button itself because the whole reason the panel exists is
              that a non-2xx used to vanish into a red toast with no status attached. */}
          <button
            onClick={() => setTraceOpen((o) => !o)}
            aria-expanded={traceOpen}
            title="Request trace — every HTTP call, with status, headers and timing"
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md border cursor-pointer transition-colors',
              traceOpen
                ? 'bg-indigo-500/15 text-accent-text border-indigo-500/40'
                : 'bg-muted/50 text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            <Activity className="h-3 w-3" />
            <span className="text-[0.65rem] font-medium uppercase tracking-wider">Trace</span>
            {traces.length > 0 && (
              <span className="text-[0.65rem] font-mono tabular-nums">
                {traces.length}
                {failures > 0 && <span className="text-warning-text"> ·{failures}</span>}
              </span>
            )}
          </button>
          {/* One button cycling system → dark → light, labelled with what it will do next rather than
              with what is currently showing — a control that names its own state leaves you guessing
              what pressing it achieves. */}
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-muted-foreground hover:text-foreground border-none cursor-pointer transition-colors"
            title={
              themeChoice === 'system'
                ? `Following the system (${themeResolved}). Click for dark.`
                : themeChoice === 'dark'
                  ? 'Dark. Click for light.'
                  : 'Light. Click to follow the system.'
            }
            aria-label={`Theme: ${themeChoice}. Change theme.`}
          >
            {themeChoice === 'system' ? (
              <MonitorCog className="h-3 w-3" />
            ) : themeChoice === 'dark' ? (
              <Moon className="h-3 w-3" />
            ) : (
              <Sun className="h-3 w-3" />
            )}
            <span className="text-[0.65rem] font-medium uppercase tracking-wider hidden sm:inline">
              {themeChoice}
            </span>
          </button>
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50"
            title={
              status === 'connected'
                ? `Server uptime: ${Math.floor(uptime ?? 0)}s`
                : 'Server unreachable'
            }
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
          <span className="hidden sm:block text-[0.65rem] text-muted-foreground font-mono">
            Authlete Node Server
          </span>
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
                  <Link
                    key={section.id}
                    to={section.path}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={activePath === section.path ? 'page' : undefined}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-left cursor-pointer border-none no-underline transition-colors',
                      activePath === section.path
                        ? 'bg-indigo-500/10 text-accent-text font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                    )}
                  >
                    <span className="shrink-0 text-current">{section.icon}</span>
                    <span>{section.label}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar groups={groups} header={sidebarHeader} />
        <main id="main" className="flex-1 overflow-y-auto">
          <div
            className="max-w-5xl mx-auto p-4 lg:p-6 xl:p-8"
            /* Reserve the drawer's height while it is open, so the last control on a page stays
               reachable instead of sitting underneath it. */
            style={traceOpen ? { paddingBottom: 'min(52vh, 30rem)' } : undefined}
          >
            <ErrorBoundary>
              <Suspense fallback={<SpinnerPage />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <TracePanel open={traceOpen} onClose={() => setTraceOpen(false)} />
    </div>
  );
}

export { AppLayout };
