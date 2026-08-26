import { useState, useMemo } from 'react';
import { CLIENT_ID, CLIENT_SECRET, DEFAULT_SCOPES } from '@/config';
import { tokenService } from '@/services';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { RequestBuilder } from '@/components/ui/RequestBuilder';
import { ArrowRightLeft, LogIn, RefreshCw, FileText } from 'lucide-react';
import type { TokenResponse } from '@/types';
import type { GrantType } from './grant-flows';

/**
 * The four grants that never leave the tab: one `POST /api/token` each, one shared result pane.
 *
 * `AuthorizationCodePanel` is the front channel and lives next door. These four are the back channel,
 * and the reason they belong together is the thing that broke on 2026-08-22: **client authentication**.
 * Three of them sent `Authorization: Basic` unconditionally, which is refused with `[A157303]` for a
 * public client, so Refresh Token failed for the same reason the code exchange did. The credential rule
 * is identical across all four, and keeping them in one file is what makes a divergence visible.
 */

/**
 * The preview must be the request, so these mirror `postWithOptionalBasic` in `token.service.ts`.
 *
 * The three secret-bearing grants used to render an `Authorization: Basic` header unconditionally,
 * which was faithful to a service that also sent one unconditionally — and both were wrong for a
 * public client, which is refused with `[A157303]` for presenting client-auth data at all. If the
 * service's rule changes again, change it here in the same commit: a preview that disagrees with the
 * wire is worse than no preview, because it is the thing people read instead of the request.
 */
const FORM_CONTENT_TYPE = { 'Content-Type': 'application/x-www-form-urlencoded' };

function basicOrNone(clientId: string, clientSecret: string): Record<string, string> {
  if (!clientSecret) return FORM_CONTENT_TYPE;
  return { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, ...FORM_CONTENT_TYPE };
}

function clientIdParam(clientId: string, clientSecret: string): string {
  return clientSecret ? '' : `&client_id=${encodeURIComponent(clientId)}`;
}

interface BackChannelGrantPanelsProps {
  grantType: GrantType;
  loading: boolean;
  /** The refresh token from an earlier grant, seeded once at mount. */
  initialRefreshToken: string;
  /**
   * Runs the token request and records which client it belonged to.
   *
   * The client id and secret are passed alongside the call rather than read out of it, because what
   * gets stored is *what the user typed* — including an emptied secret, which has to be written down as
   * absent. See `saveClientCredentials` in `AuthFlowsSection`.
   */
  onSubmit: (
    clientId: string,
    clientSecret: string,
    fn: () => Promise<TokenResponse>,
  ) => Promise<void>;
}

function BackChannelGrantPanels({
  grantType,
  loading,
  initialRefreshToken,
  onSubmit,
}: BackChannelGrantPanelsProps) {
  const [ccId, setCcId] = useState(CLIENT_ID);
  const [ccSecret, setCcSecret] = useState(CLIENT_SECRET);
  const [ccScope, setCcScope] = useState(DEFAULT_SCOPES);

  const [pwUser, setPwUser] = useState('');
  const [pwPass, setPwPass] = useState('');
  const [pwId, setPwId] = useState(CLIENT_ID);
  const [pwSecret, setPwSecret] = useState(CLIENT_SECRET);
  const [pwScope, setPwScope] = useState(DEFAULT_SCOPES);

  const [rtToken, setRtToken] = useState(initialRefreshToken);
  const [rtId, setRtId] = useState(CLIENT_ID);
  const [rtSecret, setRtSecret] = useState(CLIENT_SECRET);

  const [jwtAssertion, setJwtAssertion] = useState('');
  const [jwtId, setJwtId] = useState(CLIENT_ID);
  const [jwtSecret, setJwtSecret] = useState(CLIENT_SECRET);
  const [jwtScope, setJwtScope] = useState(DEFAULT_SCOPES);
  const requestPreview = useMemo(() => {
    switch (grantType) {
      case 'authorization_code':
        // No preview here. `AuthorizeRequestBuilder` renders the real URL, built from the same object
        // it navigates to — the hand-assembled string that used to sit here omitted `state`, `nonce`
        // and `code_challenge`, so it showed an approximation of the request and never the request.
        return null;
      case 'client_credentials':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: basicOrNone(ccId, ccSecret),
          body: `grant_type=client_credentials&scope=${encodeURIComponent(ccScope)}${clientIdParam(ccId, ccSecret)}`,
        };
      case 'password':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: basicOrNone(pwId, pwSecret),
          body: `grant_type=password&username=${encodeURIComponent(pwUser)}&password=${encodeURIComponent(pwPass)}&scope=${encodeURIComponent(pwScope)}${clientIdParam(pwId, pwSecret)}`,
        };
      case 'refresh_token':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: basicOrNone(rtId, rtSecret),
          body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(rtToken)}${clientIdParam(rtId, rtSecret)}`,
        };
      case 'jwt_bearer':
        return {
          method: 'POST' as const,
          url: '/api/token',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(jwtId && jwtSecret
              ? { Authorization: `Basic ${btoa(`${jwtId}:${jwtSecret}`)}` }
              : {}),
          },
          body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtAssertion ? '<signed_jwt>' : '<empty>'}${jwtScope ? `&scope=${encodeURIComponent(jwtScope)}` : ''}`,
        };
    }
  }, [
    grantType,
    ccId,
    ccSecret,
    ccScope,
    pwUser,
    pwPass,
    pwId,
    pwSecret,
    pwScope,
    rtToken,
    rtId,
    rtSecret,
    jwtAssertion,
    jwtId,
    jwtSecret,
    jwtScope,
  ]);

  return (
    <>
      {grantType === 'client_credentials' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Client ID"
              value={ccId}
              onChange={(e) => setCcId(e.target.value)}
              placeholder="Your registered client ID"
            />
            <Input
              label="Client Secret"
              type="password"
              value={ccSecret}
              onChange={(e) => setCcSecret(e.target.value)}
              placeholder="Keep this confidential"
            />
          </div>
          <Input
            label="Scope"
            value={ccScope}
            onChange={(e) => setCcScope(e.target.value)}
            placeholder="e.g. openid profile email"
          />
          <Button
            onClick={() =>
              onSubmit(ccId, ccSecret, () =>
                tokenService.clientCredentials(ccId, ccSecret, ccScope),
              )
            }
            loading={loading}
            className="w-full sm:w-auto"
          >
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Get Token
          </Button>
        </div>
      )}

      {grantType === 'password' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Username"
              value={pwUser}
              onChange={(e) => setPwUser(e.target.value)}
              placeholder="e.g. admin"
            />
            <Input
              label="Password"
              type="password"
              value={pwPass}
              onChange={(e) => setPwPass(e.target.value)}
              placeholder="User password"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Client ID"
              value={pwId}
              onChange={(e) => setPwId(e.target.value)}
              placeholder="Your registered client ID"
            />
            <Input
              label="Client Secret"
              type="password"
              value={pwSecret}
              onChange={(e) => setPwSecret(e.target.value)}
              placeholder="Client secret for confidential clients"
            />
          </div>
          <Input
            label="Scope"
            value={pwScope}
            onChange={(e) => setPwScope(e.target.value)}
            placeholder="e.g. openid profile email"
          />
          <Button
            onClick={() =>
              onSubmit(pwId, pwSecret, () =>
                tokenService.passwordGrant(pwUser, pwPass, pwId, pwSecret, pwScope),
              )
            }
            loading={loading}
            className="w-full sm:w-auto"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Get Token
          </Button>
        </div>
      )}

      {grantType === 'refresh_token' && (
        <div className="space-y-3">
          <Input
            label="Refresh Token"
            value={rtToken}
            onChange={(e) => setRtToken(e.target.value)}
            placeholder="Paste a refresh token from a previous flow"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Client ID"
              value={rtId}
              onChange={(e) => setRtId(e.target.value)}
              placeholder="Your registered client ID"
            />
            <Input
              label="Client Secret"
              type="password"
              value={rtSecret}
              onChange={(e) => setRtSecret(e.target.value)}
              placeholder="Client secret for confidential clients"
            />
          </div>
          <Button
            onClick={() =>
              onSubmit(rtId, rtSecret, () => tokenService.refreshToken(rtToken, rtId, rtSecret))
            }
            loading={loading}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Token
          </Button>
        </div>
      )}

      {grantType === 'jwt_bearer' && (
        <div className="space-y-3">
          <Input
            label="Signed JWT Assertion"
            value={jwtAssertion}
            onChange={(e) => setJwtAssertion(e.target.value)}
            placeholder="Paste a signed JWT (RS256, ES256, etc.)"
          />
          <Input
            label="Scope"
            value={jwtScope}
            onChange={(e) => setJwtScope(e.target.value)}
            placeholder="e.g. openid profile email (optional)"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Client ID"
              value={jwtId}
              onChange={(e) => setJwtId(e.target.value)}
              placeholder="Your registered client ID"
            />
            <Input
              label="Client Secret"
              type="password"
              value={jwtSecret}
              onChange={(e) => setJwtSecret(e.target.value)}
              placeholder="Client secret (optional)"
            />
          </div>
          {/* `disabled` reads `loading` directly — it was `loading !== null`, and this hook's
                      `loading` is a boolean, so the button could never enable and the RFC 7523 grant
                      was unreachable. See the note in StepUpSection: same idiom, same cause. */}
          <Button
            onClick={() =>
              onSubmit(jwtId, jwtSecret, () =>
                tokenService.jwtBearerGrant(
                  jwtAssertion,
                  jwtId || undefined,
                  jwtSecret || undefined,
                  jwtScope || undefined,
                ),
              )
            }
            loading={loading}
            disabled={!jwtAssertion || loading}
            className="w-full sm:w-auto"
          >
            <FileText className="h-4 w-4 mr-2" />
            Exchange JWT for Token
          </Button>
          <p className="text-2xs text-muted-foreground">
            The JWT must be signed with a key registered to the client (RS256 or ES256)
          </p>
        </div>
      )}

      {requestPreview && (
        <RequestBuilder
          method={requestPreview.method}
          url={requestPreview.url}
          headers={requestPreview.headers}
          body={'body' in requestPreview ? requestPreview.body : undefined}
        />
      )}
    </>
  );
}

export { BackChannelGrantPanels };
