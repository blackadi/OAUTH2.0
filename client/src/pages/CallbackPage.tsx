import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CLIENT_ID, getRedirectUri } from '../config';
import { apiService, TokenResponse } from '../services/api';
import { jwtDecode, JwtPayload } from 'jwt-decode';

const CallbackPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenResponse, setTokenResponse] = useState<TokenResponse | null>(null);
  const [decodedIDToken, setDecodedIDToken] = useState<JwtPayload>({});

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const iss = url.searchParams.get('iss');
    const errorParam = url.searchParams.get('error');

    if (errorParam) {
      setError(`Authorization error: ${errorParam}`);
      setLoading(false);
      return;
    }

    if (!code) {
      setError('Missing authorization code in callback URL');
      setLoading(false);
      return;
    }

    const expectedState = sessionStorage.getItem('oauth_state');
    if (expectedState && state && expectedState !== state) {
      setError('State parameter mismatch; possible CSRF issue');
      setLoading(false);
      return;
    }

    const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
    if (!codeVerifier) {
      setError('Missing PKCE code verifier in session storage');
      setLoading(false);
      return;
    }

    const exchange = async () => {
      try {
        const redirectUri = getRedirectUri();
        
        const tokenRequest = {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: CLIENT_ID,
          code_verifier: codeVerifier,
        };

        const body = await apiService.exchangeCodeForToken(tokenRequest);

        setTokenResponse(body);
        sessionStorage.setItem('token_response', JSON.stringify(body));

        const token = body.id_token??"";
        const decoded = jwtDecode(token);
        console.log(decoded);
        setDecodedIDToken(decoded);
      } catch (e: any) {
        setError(e?.message || 'Failed to exchange code for token');
      } finally {
        setLoading(false);
      }
    };

    exchange();
  }, [location]);

  const backHome = () => {
    navigate('/');
  };

  return (
    <div className="card">
      <h1>Callback</h1>
      {loading && <p>Exchanging authorization code for tokens…</p>}
      {!loading && error && <div className="error">{error}</div>}
      {!loading && !error && tokenResponse && (
        <>
          <p>Successfully obtained tokens from the authorization server.</p>
          <pre
            style={{
              backgroundColor: '#020617',
              padding: '1rem',
              borderRadius: '0.75rem',
              overflowX: 'auto',
              fontSize: '0.8rem',
            }}
          >
            {JSON.stringify(tokenResponse, null, 2)}

            <p style={{paddingTop: '1rem'}}>Decoded ID Token:{JSON.stringify(decodedIDToken, null, 2)}</p>
            
          </pre>
        </>
      )}
      {!loading && (
        <button
          type="button"
          className="button secondary"
          style={{ marginTop: '1rem' }}
          onClick={backHome}
        >
          Back to client
        </button>
      )}
    </div>
  );
};

export default CallbackPage;
