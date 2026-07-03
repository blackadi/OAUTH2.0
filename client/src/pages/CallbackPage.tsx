import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CLIENT_ID, CLIENT_SECRET, TOKEN_ENDPOINT, getRedirectUri } from '@/config';
import { tokenService } from '@/services';
import type { TokenResponseWithNonce } from '@/services/token.service';
import { createProof } from '@/services/dpop.service';
import { createClientAssertion } from '@/services/client-assertion.service';
import { jwtDecode, type JwtPayload } from 'jwt-decode';
import { useToken } from '@/context/TokenContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { Spinner } from '@/components/ui/Spinner';
import type { TokenResponse } from '@/types';

interface CallbackState {
  error: string | null;
  loading: boolean;
  tokenResponse: TokenResponse | null;
  decodedIDToken: JwtPayload;
}

const CallbackPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setTokenSet } = useToken();
  const [state, setState] = useState<CallbackState>({
    error: null,
    loading: true,
    tokenResponse: null,
    decodedIDToken: {},
  });

  useEffect(() => {
    const processCallback = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const stateParam = url.searchParams.get('state');
      const errorParam = url.searchParams.get('error');

      if (errorParam) {
        setState({ error: `Authorization error: ${errorParam}`, loading: false, tokenResponse: null, decodedIDToken: {} });
        return;
      }

      if (!code) {
        setState({ error: 'Missing authorization code in callback URL', loading: false, tokenResponse: null, decodedIDToken: {} });
        return;
      }

      const expectedState = sessionStorage.getItem('oauth_state');
      if (expectedState && stateParam && expectedState !== stateParam) {
        setState({ error: 'State parameter mismatch; possible CSRF issue', loading: false, tokenResponse: null, decodedIDToken: {} });
        return;
      }

      const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
      if (!codeVerifier) {
        setState({ error: 'Missing PKCE code verifier in session storage', loading: false, tokenResponse: null, decodedIDToken: {} });
        return;
      }

      try {
        const storedClientId = sessionStorage.getItem('authz_client_id') || CLIENT_ID;
        const redirectUri = getRedirectUri();

        const dpopPrivateKeyRaw = sessionStorage.getItem('dpop_private_key');
        const signingPrivateKeyRaw = sessionStorage.getItem('fapi_signing_private_key');
        let body: TokenResponse;
        let dpopNonce: string | undefined;

        if (dpopPrivateKeyRaw && signingPrivateKeyRaw) {
          const dpopPrivateKeyJwk = JSON.parse(dpopPrivateKeyRaw);
          const signingPrivateKeyJwk = JSON.parse(signingPrivateKeyRaw);
          const storedNonce = sessionStorage.getItem('dpop_nonce') || undefined;
          const dpopProof = await createProof(
            dpopPrivateKeyJwk,
            'POST',
            TOKEN_ENDPOINT,
            undefined,
            storedNonce,
          );
          const clientAssertion = await createClientAssertion(
            signingPrivateKeyJwk,
            storedClientId,
            TOKEN_ENDPOINT,
          );
          const result: TokenResponseWithNonce = await tokenService.exchangeCodeForTokenWithDpop(
            {
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
              client_id: storedClientId,
              code_verifier: codeVerifier,
              client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
              client_assertion: clientAssertion,
            },
            dpopProof,
          );
          body = result.tokenResponse;
          dpopNonce = result.dpopNonce;
        } else if (dpopPrivateKeyRaw) {
          const privateKeyJwk = JSON.parse(dpopPrivateKeyRaw);
          const storedNonce = sessionStorage.getItem('dpop_nonce') || undefined;
          const dpopProof = await createProof(
            privateKeyJwk,
            'POST',
            TOKEN_ENDPOINT,
            undefined,
            storedNonce,
          );
          const storedSecret = sessionStorage.getItem('authz_client_secret') || CLIENT_SECRET;
          const result: TokenResponseWithNonce = await tokenService.exchangeCodeForTokenWithDpop(
            {
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
              client_id: storedClientId,
              client_secret: storedSecret,
              code_verifier: codeVerifier,
            },
            dpopProof,
          );
          body = result.tokenResponse;
          dpopNonce = result.dpopNonce;
        } else {
          const storedSecret = sessionStorage.getItem('authz_client_secret') || CLIENT_SECRET;
          body = await tokenService.exchangeCodeForToken({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: storedClientId,
            client_secret: storedSecret,
            code_verifier: codeVerifier,
          });
        }

        setTokenSet(body);
        sessionStorage.setItem('active_client_id', storedClientId);

        if (dpopNonce) {
          sessionStorage.setItem('dpop_nonce', dpopNonce);
        }

        const decodedIdToken = body.id_token ? jwtDecode<JwtPayload>(body.id_token) : {};
        setState({
          error: null,
          loading: false,
          tokenResponse: body,
          decodedIDToken: decodedIdToken,
        });
        toast.success('Tokens obtained successfully');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to exchange code for token';
        setState({ error: msg, loading: false, tokenResponse: null, decodedIDToken: {} });
        toast.error(msg);
      }
    };

    processCallback();
  }, [location, setTokenSet]);

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Callback</CardTitle>
        {state.loading && <CardDescription>Exchanging authorization code for tokens\u2026</CardDescription>}
      </CardHeader>
      <CardContent>
        {state.loading && (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        )}
        {!state.loading && state.error && <p className="text-sm text-red-400">{state.error}</p>}
        {!state.loading && !state.error && state.tokenResponse && (
          <div className="space-y-4">
            <p className="text-sm text-green-400">Successfully obtained tokens from the authorization server.</p>
            <JsonBlock data={state.tokenResponse} label="Token Response" />
            <JsonBlock data={state.decodedIDToken} label="Decoded ID Token" />
          </div>
        )}
        {!state.loading && (
          <div className="mt-6">
            <Button variant="secondary" onClick={() => navigate('/')}>
              Return to Dashboard
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CallbackPage;
