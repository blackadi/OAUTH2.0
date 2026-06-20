import { Link, Route, Routes } from 'react-router-dom';
import { TokenProvider } from './context/TokenContext';
import Dashboard from './pages/Dashboard';
import CallbackPage from './pages/CallbackPage';

const App: React.FC = () => {
  return (
    <TokenProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-title">OAuth2 / OIDC Testing Dashboard</div>
          <nav>
            <Link to="/">Dashboard</Link>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/callback" element={<CallbackPage />} />
          </Routes>
        </main>
      </div>
    </TokenProvider>
  );
};

export default App;
