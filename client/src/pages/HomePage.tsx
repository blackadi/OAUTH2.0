import React, { useState } from 'react';
import { AUTHORIZATION_ENDPOINT, CLIENT_ID, DEFAULT_SCOPES, getRedirectUri, isDevelopment } from '../config';
import { createPkcePair } from '../pkce';

const HomePage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const { codeVerifier, codeChallenge } = await createPkcePair();
      const state = crypto.randomUUID();
      const nonce = crypto.randomUUID();

      sessionStorage.setItem('pkce_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      const redirectUri = getRedirectUri();

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        scope: DEFAULT_SCOPES,
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      window.location.href = `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
    } catch (e: any) {
      setError(e?.message || 'Failed to initiate login');
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h1>Demo OAuth 2.0 Client</h1>
      <p>Start an Authorization Code Flow with PKCE against the Authlete-backed authorization server.</p>
      {error && <div className="error">{error}</div>}
      <button type="button" className="button" onClick={startLogin} disabled={loading}>
        {loading ? 'Redirecting…' : 'Sign in with Authlete Node Authorization Server (DEMO: Public Client Type with PKCE) '}
      </button>
      {isDevelopment && (
        <div className="info" style={{ 
          marginTop: '1rem', 
          padding: '0.5rem', 
          backgroundColor: '#14191cff', 
          borderRadius: '4px',
          fontSize: '0.8rem'
        }}>
          <strong>Development Mode:</strong>
          <br />
          • API Base URL: {AUTHORIZATION_ENDPOINT.replace('/authorize', '')}
          <br />
          • Redirect URI: {getRedirectUri()}
        </div>
      )}
    </div>
  );
};

export default HomePage;
