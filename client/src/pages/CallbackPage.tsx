import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { API_BASE_URL, CLIENT_ID, CLIENT_SECRET, TOKEN_ENDPOINT, getRedirectUri } from '@/config';
import { tokenService } from '@/services';
import type { TokenResponseWithNonce } from '@/services/token.service';
import { createProof } from '@/services/dpop.service';
import { createClientAssertion } from '@/services/client-assertion.service';
import { JwtInspector } from '@/components/ui/JwtInspector';
import { useToken } from '@/context/TokenContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { ErrorExplainer } from '@/components/ui/ErrorExplainer';
import { Spinner } from '@/components/ui/Spinner';
import type { TokenResponse } from '@/types';
import { SESSION_KEYS, readKey, writeKey } from '@/services/session-keys';

interface CallbackState {
  error: string | null;
  loading: boolean;
  tokenResponse: TokenResponse | null;
}

const CallbackPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setTokenSet } = useToken();
  const [state, setState] = useState<CallbackState>({
    error: null,
    loading: true,
    tokenResponse: null,
  });

  useEffect(() => {
    const processCallback = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const stateParam = url.searchParams.get('state');
      const errorParam = url.searchParams.get('error');

      if (errorParam) {
        // `error_description` and `error_uri` were being discarded, which threw away the useful half of
        // a failed authorization: RFC 6749 §4.1.2.1 defines all three, and the description is where the
        // server says *what* was wrong. The full string is handed to `ErrorExplainer` below, which
        // decodes the code and any `[Annnnnn]` inside the description.
        const parts = [`error=${errorParam}`];
        const description = url.searchParams.get('error_description');
        const errorUri = url.searchParams.get('error_uri');
        if (description) parts.push(`error_description="${description}"`);
        if (errorUri) parts.push(`error_uri="${errorUri}"`);
        setState({ error: parts.join(', '), loading: false, tokenResponse: null });
        return;
      }

      if (!code) {
        setState({ error: 'Missing authorization code in callback URL', loading: false, tokenResponse: null });
        return;
      }

      /**
       * `state` is checked fail-closed.
       *
       * This was `if (expectedState && stateParam && expectedState !== stateParam)`, which skipped the
       * check entirely when *either* side was absent — a callback arriving with no `state`, or after
       * session storage was cleared, went straight on to redeem the code. In a tool whose job is
       * teaching, the one place a learner looks to see how CSRF protection is done modelled the mistake.
       *
       * Absence is now answered as "no", the same rule the server applies to an unknown `acr` and to
       * unset management credentials: an absent value selects the safest behaviour.
       */
      const expectedState = readKey(SESSION_KEYS.oauthState);
      if (!expectedState) {
        setState({
          error:
            'No stored `state` to compare against, so the response cannot be bound to a request this app started. Begin the flow from the Grant Flows section.',
          loading: false,
          tokenResponse: null,
        });
        return;
      }
      if (!stateParam) {
        setState({
          error: 'The callback carried no `state`, so it cannot be matched to the request that started it.',
          loading: false,
          tokenResponse: null,
        });
        return;
      }
      if (expectedState !== stateParam) {
        setState({
          error: `State mismatch — sent "${expectedState}", received "${stateParam}". This is what a CSRF attempt looks like, and the flow stops here.`,
          loading: false,
          tokenResponse: null,
        });
        return;
      }

      /**
       * RFC 9207: `iss` identifies the authorization server that answered, and comparing it defends
       * against a mix-up attack where a response from one AS is replayed to a client expecting another.
       * This service deliberately does not suppress it (`issSuppressed: false`), so it is present — and
       * a *missing* `iss` is reported rather than ignored, since silence would make the check
       * indistinguishable from not having one.
       */
      const issParam = url.searchParams.get('iss');
      if (issParam && !API_BASE_URL.startsWith(new URL(issParam).origin)) {
        setState({
          error: `The response reports iss="${issParam}", which is not the server this app is configured for (${API_BASE_URL}). RFC 9207 exists to catch exactly this.`,
          loading: false,
          tokenResponse: null,
        });
        return;
      }

      const codeVerifier = readKey(SESSION_KEYS.pkceVerifier);
      if (!codeVerifier) {
        setState({ error: 'Missing PKCE code verifier in session storage', loading: false, tokenResponse: null });
        return;
      }

      try {
        const storedClientId = readKey(SESSION_KEYS.authzClientId) || CLIENT_ID;
        const redirectUri = getRedirectUri();

        const dpopPrivateKeyRaw = readKey(SESSION_KEYS.dpopPrivateKey);
        const signingPrivateKeyRaw = readKey(SESSION_KEYS.fapiSigningKey);
        let body: TokenResponse;

        if (dpopPrivateKeyRaw && signingPrivateKeyRaw) {
          const dpopPrivateKeyJwk = JSON.parse(dpopPrivateKeyRaw);
          const signingPrivateKeyJwk = JSON.parse(signingPrivateKeyRaw);
          // A factory, not a proof. On a `use_dpop_nonce` refusal the proof must be re-signed with the
          // new nonce; the authorization code survives that refusal (verified live 2026-08-17), so the
          // retry inside `dpopRequest` completes the exchange rather than forcing a re-authorization.
          const dpopProof = (nonce?: string) =>
            createProof(dpopPrivateKeyJwk, 'POST', TOKEN_ENDPOINT, undefined, nonce);
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
        } else if (dpopPrivateKeyRaw) {
          const privateKeyJwk = JSON.parse(dpopPrivateKeyRaw);
          // A factory, not a proof — see the note in the branch above.
          const dpopProof = (nonce?: string) =>
            createProof(privateKeyJwk, 'POST', TOKEN_ENDPOINT, undefined, nonce);
          const storedSecret = readKey(SESSION_KEYS.authzClientSecret) || CLIENT_SECRET;
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
        } else {
          const storedSecret = readKey(SESSION_KEYS.authzClientSecret) || CLIENT_SECRET;
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
        writeKey(SESSION_KEYS.activeClientId, storedClientId);

        setState({ error: null, loading: false, tokenResponse: body });
        toast.success('Tokens obtained successfully');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to exchange code for token';
        setState({ error: msg, loading: false, tokenResponse: null });
        toast.error(msg);
      }
    };

    processCallback();
  }, [location, setTokenSet]);

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Callback</CardTitle>
        {state.loading && <CardDescription>Exchanging authorization code for tokens…</CardDescription>}
      </CardHeader>
      <CardContent>
        {state.loading && (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        )}
        {!state.loading && state.error && <ErrorExplainer error={state.error} />}
        {!state.loading && !state.error && state.tokenResponse && (
          <div className="space-y-4">
            <p className="text-sm text-success-text">Successfully obtained tokens from the authorization server.</p>
            <JsonBlock data={state.tokenResponse} label="Token Response" />
            {state.tokenResponse.id_token && (
              <JwtInspector token={state.tokenResponse.id_token} label="ID Token" defaultOpen />
            )}
            {state.tokenResponse.access_token && (
              <JwtInspector token={state.tokenResponse.access_token} label="Access Token" />
            )}
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
