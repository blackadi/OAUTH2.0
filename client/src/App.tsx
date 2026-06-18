import React from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CallbackPage from './pages/CallbackPage';

const App: React.FC = () => {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-title">Authlete OAuth2 / OIDC Demo</div>
        <nav>
          <Link to="/" className="small">
            Home
          </Link>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/callback" element={<CallbackPage />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
