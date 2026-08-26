import { lazy, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { shouldSkipLanding } from '@/services/preferences';
import { TokenProvider } from '@/context/TokenContext';
import { CredentialProvider } from '@/context/CredentialContext';
import { AppLayout } from '@/components/layout/AppLayout';
import CallbackPage from './pages/CallbackPage';
import {
  KeyRound,
  Shield,
  LogOut,
  UserPlus,
  Bell,
  Send,
  Smartphone,
  BellOff,
  Compass,
  Globe,
  Settings,
  Users,
  FileCheck,
  HeartPulse,
  BadgeCheck,
  ListChecks,
  FileText,
  ShieldAlert,
  Bot,
  BookOpen,
  ArrowRightLeft,
} from 'lucide-react';

const AuthFlowsSection = lazy(() => import('@/components/auth/AuthFlowsSection'));
const TokenOpsSection = lazy(() =>
  import('@/components/oidc/TokenOpsSection').then((m) => ({ default: m.TokenOpsSection })),
);
const AdminSection = lazy(() =>
  import('@/components/admin/AdminSection').then((m) => ({ default: m.AdminSection })),
);
const ClientManagementSection = lazy(() =>
  import('@/components/admin/ClientManagementSection').then((m) => ({
    default: m.ClientManagementSection,
  })),
);
const GrantManagementSection = lazy(() =>
  import('@/components/admin/GrantManagementSection').then((m) => ({
    default: m.GrantManagementSection,
  })),
);
const DcrSection = lazy(() =>
  import('@/components/oidc/DcrSection').then((m) => ({ default: m.DcrSection })),
);
const CibaSection = lazy(() =>
  import('@/components/oidc/CibaSection').then((m) => ({ default: m.CibaSection })),
);
const ParSection = lazy(() =>
  import('@/components/oidc/ParSection').then((m) => ({ default: m.ParSection })),
);
const DeviceSection = lazy(() =>
  import('@/components/oidc/DeviceSection').then((m) => ({ default: m.DeviceSection })),
);
const BackchannelLogoutSection = lazy(() =>
  import('@/components/oidc/BackchannelLogoutSection').then((m) => ({
    default: m.BackchannelLogoutSection,
  })),
);
const LogoutSection = lazy(() =>
  import('@/components/oidc/LogoutSection').then((m) => ({ default: m.LogoutSection })),
);
const DiscoverySection = lazy(() =>
  import('@/components/oidc/DiscoverySection').then((m) => ({ default: m.DiscoverySection })),
);
const FederationSection = lazy(() =>
  import('@/components/oidc/FederationSection').then((m) => ({ default: m.FederationSection })),
);
const VciSection = lazy(() =>
  import('@/components/vci/VciSection').then((m) => ({ default: m.VciSection })),
);
const FapiSection = lazy(() =>
  import('@/components/fapi/FapiSection').then((m) => ({ default: m.FapiSection })),
);
const McpSection = lazy(() =>
  import('@/components/mcp/McpSection').then((m) => ({ default: m.McpSection })),
);
const RarSection = lazy(() =>
  import('@/components/oidc/RarSection').then((m) => ({ default: m.RarSection })),
);
const JarSection = lazy(() =>
  import('@/components/oidc/JarSection').then((m) => ({ default: m.JarSection })),
);
const HealthSection = lazy(() =>
  import('@/components/admin/HealthSection').then((m) => ({ default: m.HealthSection })),
);
/**
 * The one reading surface, and the reason it is lazy like the rest: it is 26 glossary entries plus four
 * data modules, and a learner who never opens it should not pay for it on first paint.
 */
const ReferencePage = lazy(() => import('@/pages/ReferencePage'));
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const TokenExchangeSection = lazy(() =>
  import('@/components/oidc/TokenExchangeSection').then((m) => ({
    default: m.TokenExchangeSection,
  })),
);
const StepUpSection = lazy(() =>
  import('@/components/oidc/StepUpSection').then((m) => ({ default: m.StepUpSection })),
);

export type SectionId =
  | 'auth-flows'
  | 'token-ops'
  | 'step-up'
  | 'logout'
  | 'dcr'
  | 'ciba'
  | 'par'
  | 'rar'
  | 'jar'
  | 'device'
  | 'backchannel-logout'
  | 'discovery'
  | 'federation'
  | 'fapi'
  | 'mcp'
  | 'vci'
  | 'admin'
  | 'client-mgmt'
  | 'grant-mgmt'
  | 'health'
  | 'reference'
  | 'token-exchange';

export interface Section {
  id: SectionId;
  label: string;
  path: string;
  icon: ReactNode;
}

export interface SectionGroup {
  label: string;
  sections: Section[];
}

const SECTIONS: SectionGroup[] = [
  {
    label: 'OAuth 2.0',
    sections: [
      {
        id: 'auth-flows',
        label: 'Grant Flows',
        path: '/auth-flows',
        icon: <KeyRound className="h-4 w-4" />,
      },
      {
        id: 'token-ops',
        label: 'Token Operations',
        path: '/token-ops',
        icon: <Shield className="h-4 w-4" />,
      },
      {
        id: 'step-up',
        label: 'Step-Up Auth',
        path: '/step-up',
        icon: <ShieldAlert className="h-4 w-4" />,
      },
      {
        id: 'token-exchange',
        label: 'Token Exchange',
        path: '/token-exchange',
        icon: <ArrowRightLeft className="h-4 w-4" />,
      },
      { id: 'logout', label: 'Logout', path: '/logout', icon: <LogOut className="h-4 w-4" /> },
    ],
  },
  {
    label: 'OIDC & Extensions',
    sections: [
      {
        id: 'dcr',
        label: 'Dynamic Client Reg.',
        path: '/dcr',
        icon: <UserPlus className="h-4 w-4" />,
      },
      { id: 'ciba', label: 'CIBA', path: '/ciba', icon: <Bell className="h-4 w-4" /> },
      { id: 'par', label: 'PAR', path: '/par', icon: <Send className="h-4 w-4" /> },
      { id: 'rar', label: 'RAR', path: '/rar', icon: <ListChecks className="h-4 w-4" /> },
      { id: 'jar', label: 'JAR', path: '/jar', icon: <FileText className="h-4 w-4" /> },
      {
        id: 'device',
        label: 'Device Flow',
        path: '/device',
        icon: <Smartphone className="h-4 w-4" />,
      },
      {
        id: 'backchannel-logout',
        label: 'Backchannel Logout',
        path: '/backchannel-logout',
        icon: <BellOff className="h-4 w-4" />,
      },
      {
        id: 'discovery',
        label: 'Discovery',
        path: '/discovery',
        icon: <Compass className="h-4 w-4" />,
      },
      {
        id: 'federation',
        label: 'OIDC Federation',
        path: '/federation',
        icon: <Globe className="h-4 w-4" />,
      },
      { id: 'fapi', label: 'FAPI 2.0 / DPoP', path: '/fapi', icon: <Shield className="h-4 w-4" /> },
      { id: 'mcp', label: 'MCP (Model Context)', path: '/mcp', icon: <Bot className="h-4 w-4" /> },
      {
        id: 'vci',
        label: 'Verifiable Credentials',
        path: '/vci',
        icon: <BadgeCheck className="h-4 w-4" />,
      },
    ],
  },
  {
    /**
     * A group of its own, first, because it is the only **reading** surface in the application.
     *
     * Every other route is a parameter editor with a response pane — a *doing* surface. The audit found
     * the whole explanatory corpus reachable only by clicking a 20px icon inside a form, which meant a
     * learner arriving from a shared link had nowhere to land except a form.
     */
    label: 'Learn',
    sections: [
      {
        id: 'reference',
        label: 'Reference',
        path: '/reference',
        icon: <BookOpen className="h-4 w-4" />,
      },
    ],
  },
  {
    label: 'Admin',
    sections: [
      {
        id: 'admin',
        label: 'Token Management',
        path: '/admin',
        icon: <Settings className="h-4 w-4" />,
      },
      {
        id: 'client-mgmt',
        label: 'Client Management',
        path: '/client-mgmt',
        icon: <Users className="h-4 w-4" />,
      },
      {
        id: 'grant-mgmt',
        label: 'Grant Management',
        path: '/grant-mgmt',
        icon: <FileCheck className="h-4 w-4" />,
      },
      {
        id: 'health',
        label: 'Health Check',
        path: '/health',
        icon: <HeartPulse className="h-4 w-4" />,
      },
    ],
  },
];

const allSectionsFlat = SECTIONS.flatMap((g) => g.sections);

const sectionComponents: Record<SectionId, React.FC> = {
  'auth-flows': AuthFlowsSection,
  'token-ops': TokenOpsSection,
  'step-up': StepUpSection,
  logout: LogoutSection,
  dcr: DcrSection,
  ciba: CibaSection,
  par: ParSection,
  rar: RarSection,
  jar: JarSection,
  device: DeviceSection,
  'backchannel-logout': BackchannelLogoutSection,
  discovery: DiscoverySection,
  federation: FederationSection,
  fapi: FapiSection,
  mcp: McpSection,
  vci: VciSection,
  admin: AdminSection,
  'client-mgmt': ClientManagementSection,
  'grant-mgmt': GrantManagementSection,
  health: HealthSection,
  reference: ReferencePage,
  'token-exchange': TokenExchangeSection,
};

/**
 * What `/` does, which depends on a stored preference.
 *
 * Read at render rather than held in state: the value can change on `/start` in the same session, and a
 * copy in state would be the stale one. `Navigate` with `replace` so Back does not bounce between the
 * two — a redirect the user did not ask for should not occupy a history entry.
 */
function HomeRoute() {
  return shouldSkipLanding() ? <Navigate to="/auth-flows" replace /> : <LandingPage />;
}

const App: React.FC = () => {
  return (
    <TokenProvider>
      <CredentialProvider>
        <Routes>
          <Route element={<AppLayout groups={SECTIONS} />}>
            {/*
              `/` was this redirect, so first paint was a twenty-item sidebar and a form. See
              `pages/LandingPage.tsx` — the audit scored the on-ramp 1/5 and called it the widest
              competitive gap.

              Two routes rather than one, deliberately. `/start` **always** renders the page, so the
              preference is an opt-out and not a one-way door: somebody who ticked the box a month ago
              can still read the introduction, and unticking it there restores `/`. A single
              preference-gated `/` would have made the page unreachable to the only people likely to
              want it back.
            */}
            <Route path="/" element={<HomeRoute />} />
            <Route path="/start" element={<LandingPage />} />
            {allSectionsFlat.map((s) => {
              const Component = sectionComponents[s.id];
              return <Route key={s.id} path={s.path} element={<Component />} />;
            })}
          </Route>
          <Route path="/callback" element={<CallbackPage />} />
        </Routes>
      </CredentialProvider>
    </TokenProvider>
  );
};

export default App;
export { allSectionsFlat };
