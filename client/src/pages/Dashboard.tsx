import TokenVault from '../components/TokenVault';
import AuthFlowsSection from '../components/AuthFlowsSection';
import TokenOpsSection from '../components/TokenOpsSection';
import AdminSection from '../components/AdminSection';
import LogoutSection from '../components/LogoutSection';
import DiscoverySection from '../components/DiscoverySection';

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
    </div>
  );
};

export default Dashboard;
