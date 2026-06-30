import { lazy, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { TokenProvider } from '@/context/TokenContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { TokenVault } from '@/components/ui/TokenVault';
import CallbackPage from './pages/CallbackPage';
import {
  KeyRound, Shield, LogOut,
  UserPlus, Bell, Send, Smartphone, BellOff, Compass, Globe,
  Settings, Users, FileCheck, HeartPulse, BadgeCheck,
} from 'lucide-react';

const AuthFlowsSection = lazy(() => import('@/components/auth/AuthFlowsSection'));
const TokenOpsSection = lazy(() => import('@/components/oidc/TokenOpsSection').then((m) => ({ default: m.TokenOpsSection })));
const AdminSection = lazy(() => import('@/components/admin/AdminSection').then((m) => ({ default: m.AdminSection })));
const ClientManagementSection = lazy(() => import('@/components/admin/ClientManagementSection').then((m) => ({ default: m.ClientManagementSection })));
const GrantManagementSection = lazy(() => import('@/components/admin/GrantManagementSection').then((m) => ({ default: m.GrantManagementSection })));
const DcrSection = lazy(() => import('@/components/oidc/DcrSection').then((m) => ({ default: m.DcrSection })));
const CibaSection = lazy(() => import('@/components/oidc/CibaSection').then((m) => ({ default: m.CibaSection })));
const ParSection = lazy(() => import('@/components/oidc/ParSection').then((m) => ({ default: m.ParSection })));
const DeviceSection = lazy(() => import('@/components/oidc/DeviceSection').then((m) => ({ default: m.DeviceSection })));
const BackchannelLogoutSection = lazy(() => import('@/components/oidc/BackchannelLogoutSection').then((m) => ({ default: m.BackchannelLogoutSection })));
const LogoutSection = lazy(() => import('@/components/oidc/LogoutSection').then((m) => ({ default: m.LogoutSection })));
const DiscoverySection = lazy(() => import('@/components/oidc/DiscoverySection').then((m) => ({ default: m.DiscoverySection })));
const FederationSection = lazy(() => import('@/components/oidc/FederationSection').then((m) => ({ default: m.FederationSection })));
const VciSection = lazy(() => import('@/components/vci/VciSection').then((m) => ({ default: m.VciSection })));
const FapiSection = lazy(() => import('@/components/fapi/FapiSection').then((m) => ({ default: m.FapiSection })));
const HealthSection = lazy(() => import('@/components/admin/HealthSection').then((m) => ({ default: m.HealthSection })));

export type SectionId =
  | 'auth-flows'
  | 'token-ops'
  | 'logout'
  | 'dcr'
  | 'ciba'
  | 'par'
  | 'device'
  | 'backchannel-logout'
  | 'discovery'
  | 'federation'
  | 'fapi'
  | 'vci'
  | 'admin'
  | 'client-mgmt'
  | 'grant-mgmt'
  | 'health';

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
      { id: 'auth-flows', label: 'Grant Flows', path: '/auth-flows', icon: <KeyRound className="h-4 w-4" /> },
      { id: 'token-ops', label: 'Token Operations', path: '/token-ops', icon: <Shield className="h-4 w-4" /> },
      { id: 'logout', label: 'Logout', path: '/logout', icon: <LogOut className="h-4 w-4" /> },
    ],
  },
  {
    label: 'OIDC & Extensions',
    sections: [
      { id: 'dcr', label: 'Dynamic Client Reg.', path: '/dcr', icon: <UserPlus className="h-4 w-4" /> },
      { id: 'ciba', label: 'CIBA', path: '/ciba', icon: <Bell className="h-4 w-4" /> },
      { id: 'par', label: 'PAR', path: '/par', icon: <Send className="h-4 w-4" /> },
      { id: 'device', label: 'Device Flow', path: '/device', icon: <Smartphone className="h-4 w-4" /> },
      { id: 'backchannel-logout', label: 'Backchannel Logout', path: '/backchannel-logout', icon: <BellOff className="h-4 w-4" /> },
      { id: 'discovery', label: 'Discovery', path: '/discovery', icon: <Compass className="h-4 w-4" /> },
      { id: 'federation', label: 'OIDC Federation', path: '/federation', icon: <Globe className="h-4 w-4" /> },
      { id: 'fapi', label: 'FAPI 2.0 / DPoP', path: '/fapi', icon: <Shield className="h-4 w-4" /> },
      { id: 'vci', label: 'Verifiable Credentials', path: '/vci', icon: <BadgeCheck className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Admin',
    sections: [
      { id: 'admin', label: 'Token Management', path: '/admin', icon: <Settings className="h-4 w-4" /> },
      { id: 'client-mgmt', label: 'Client Management', path: '/client-mgmt', icon: <Users className="h-4 w-4" /> },
      { id: 'grant-mgmt', label: 'Grant Management', path: '/grant-mgmt', icon: <FileCheck className="h-4 w-4" /> },
      { id: 'health', label: 'Health Check', path: '/health', icon: <HeartPulse className="h-4 w-4" /> },
    ],
  },
];

const allSectionsFlat = SECTIONS.flatMap((g) => g.sections);

const sectionComponents: Record<SectionId, React.FC> = {
  'auth-flows': AuthFlowsSection,
  'token-ops': TokenOpsSection,
  'logout': LogoutSection,
  'dcr': DcrSection,
  'ciba': CibaSection,
  'par': ParSection,
  'device': DeviceSection,
  'backchannel-logout': BackchannelLogoutSection,
  'discovery': DiscoverySection,
  'federation': FederationSection,
  'fapi': FapiSection,
  'vci': VciSection,
  'admin': AdminSection,
  'client-mgmt': ClientManagementSection,
  'grant-mgmt': GrantManagementSection,
  'health': HealthSection,
};

const App: React.FC = () => {
  return (
    <TokenProvider>
      <Routes>
        <Route element={<AppLayout groups={SECTIONS} sidebarHeader={<TokenVault />} />}>
          <Route path="/" element={<Navigate to="/auth-flows" replace />} />
          {allSectionsFlat.map((s) => {
            const Component = sectionComponents[s.id];
            return <Route key={s.id} path={s.path} element={<Component />} />;
          })}
        </Route>
        <Route path="/callback" element={<CallbackPage />} />
      </Routes>
    </TokenProvider>
  );
};

export default App;
export { allSectionsFlat };
