import TokenVault from '../components/TokenVault';
import AuthFlowsSection from '../components/AuthFlowsSection';
import TokenOpsSection from '../components/TokenOpsSection';
import AdminSection from '../components/AdminSection';
import ClientManagementSection from '../components/ClientManagementSection';
import LogoutSection from '../components/LogoutSection';
import DiscoverySection from '../components/DiscoverySection';
import GrantManagementSection from '../components/GrantManagementSection';
import DcrSection from '../components/DcrSection';
import CibaSection from '../components/CibaSection';
import ParSection from '../components/ParSection';
import BackchannelLogoutSection from '../components/BackchannelLogoutSection';
import HealthSection from '../components/HealthSection';

const Dashboard: React.FC = () => {
  return (
    <div className="dashboard">
      <TokenVault />

      <details className="section" open>
        <summary className="section-summary">Authorization Flows</summary>
        <div className="section-body">
          <AuthFlowsSection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">Token Operations</summary>
        <div className="section-body">
          <TokenOpsSection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">Admin Token Management</summary>
        <div className="section-body">
          <AdminSection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">Client Management</summary>
        <div className="section-body">
          <ClientManagementSection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">Grant Management</summary>
        <div className="section-body">
          <GrantManagementSection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">Dynamic Client Registration</summary>
        <div className="section-body">
          <DcrSection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">CIBA (Backchannel Authentication)</summary>
        <div className="section-body">
          <CibaSection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">PAR (Pushed Authorization Requests)</summary>
        <div className="section-body">
          <ParSection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">Backchannel Logout</summary>
        <div className="section-body">
          <BackchannelLogoutSection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">Logout</summary>
        <div className="section-body">
          <LogoutSection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">Discovery</summary>
        <div className="section-body">
          <DiscoverySection />
        </div>
      </details>

      <details className="section" open>
        <summary className="section-summary">Health Check</summary>
        <div className="section-body">
          <HealthSection />
        </div>
      </details>
    </div>
  );
};

export default Dashboard;
