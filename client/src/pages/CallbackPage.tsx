import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CLIENT_ID, getRedirectUri } from '../config';
import { apiService, type TokenResponse } from '../services/api';
import { jwtDecode, type JwtPayload } from 'jwt-decode';
import { useToken } from '../context/TokenContext';

const CallbackPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setTokenSet } = useToken();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenResponse, setTokenResponse] = useState<TokenResponse | null>(null);
  const [decodedIDToken, setDecodedIDToken] = useState<JwtPayload>({});

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
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
        const storedClientId = sessionStorage.getItem('authz_client_id') || CLIENT_ID;
        const redirectUri = getRedirectUri();
        const tokenRequest = {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: storedClientId,
          code_verifier: codeVerifier,
        };

        const body = await apiService.exchangeCodeForToken(tokenRequest);

        setTokenResponse(body);
        setTokenSet(body);
        sessionStorage.setItem('active_client_id', storedClientId);

        const token = body.id_token ?? "";
        const decoded = jwtDecode(token);
        setDecodedIDToken(decoded);
      } catch (e: any) {
        setError(e?.message || 'Failed to exchange code for token');
      } finally {
        setLoading(false);
      }
    };

    exchange();
  }, [location]);

  return (
    <div className="card">
      <h1>Callback</h1>
      {loading && <p>Exchanging authorization code for tokens…</p>}
      {!loading && error && <div className="error">{error}</div>}
      {!loading && !error && tokenResponse && (
        <>
          <p>Successfully obtained tokens from the authorization server.</p>
          <pre className="json-block">
            {JSON.stringify(tokenResponse, null, 2)}
            <p style={{ paddingTop: '1rem' }}>Decoded ID Token:{JSON.stringify(decodedIDToken, null, 2)}</p>
          </pre>
        </>
      )}
      {!loading && (
        <button type="button" className="button secondary" style={{ marginTop: '1rem' }} onClick={() => navigate('/')}>
          Return to Dashboard
        </button>
      )}
    </div>
  );
};

export default CallbackPage;
