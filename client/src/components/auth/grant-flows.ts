/**
 * Which grants this section offers, and what each one's flow actually does at every step.
 *
 * Pure configuration, separated from the two panels that render it so that adding a grant is a change
 * to a table rather than to a component. `flowSteps` carries a `description` per step because
 * `FlowDiagram` has always accepted one and no call site ever passed one — the diagram was five bare
 * words. **Which channel a step uses is stated wherever it differs**, since front channel versus back
 * channel is the structural idea the flow exists to teach and it is invisible in a row of labels.
 *
 * The split between the two panels follows that same line: `AuthorizationCodePanel` is the front
 * channel, `BackChannelGrantPanels` is the four grants that never leave the tab.
 */

export type GrantType =
  'authorization_code' | 'client_credentials' | 'password' | 'refresh_token' | 'jwt_bearer';

export const GRANTS: { value: GrantType; label: string }[] = [
  { value: 'authorization_code', label: 'Auth Code (PKCE)' },
  { value: 'client_credentials', label: 'Client Credentials' },
  { value: 'password', label: 'Password (ROPC)' },
  { value: 'refresh_token', label: 'Refresh Token' },
  { value: 'jwt_bearer', label: 'JWT Bearer (RFC 7523)' },
];

/** The tab values, for `useUrlState` to validate `?op=` against rather than trusting it. */
export const GRANT_VALUES: readonly GrantType[] = GRANTS.map((g) => g.value);
/**
 * Each step says what happens there, not only what it is called.
 *
 * `FlowDiagram` has always accepted a `description` and no call site ever passed one, so this diagram
 * was five bare words. Which channel a step uses is stated wherever it differs, because front channel
 * versus back channel is the structural idea the flow exists to teach and it is invisible in a row of
 * labels.
 */
export const flowSteps: Record<GrantType, { id: string; label: string; description?: string }[]> = {
  authorization_code: [
    {
      id: 'authz',
      label: 'Authorize',
      description: 'Front channel: the browser leaves for the authorization endpoint.',
    },
    {
      id: 'login',
      label: 'Login',
      description: 'The End-User authenticates at the server, not in this app.',
    },
    { id: 'consent', label: 'Consent', description: 'They approve the scopes being requested.' },
    {
      id: 'callback',
      label: 'Callback',
      description: 'Front channel: a redirect brings a one-time code back.',
    },
    {
      id: 'token',
      label: 'Token',
      description: 'Back channel: the code plus the PKCE verifier are exchanged for tokens.',
    },
  ],
  client_credentials: [
    {
      id: 'auth',
      label: 'Authenticate',
      description: 'The client proves who it is. No user is involved.',
    },
    { id: 'token', label: 'Token', description: 'A token for the client itself, with no subject.' },
  ],
  password: [
    {
      id: 'creds',
      label: 'Credentials',
      description: 'The user hands their password to the client — why ROPC is discouraged.',
    },
    { id: 'token', label: 'Token', description: 'The client forwards them to the token endpoint.' },
  ],
  refresh_token: [
    {
      id: 'verify',
      label: 'Verify Token',
      description: 'A refresh token from an earlier grant is presented.',
    },
    {
      id: 'refresh',
      label: 'Refresh',
      description: 'A fresh access token, without sending the user back.',
    },
  ],
  jwt_bearer: [
    {
      id: 'sign',
      label: 'Sign JWT',
      description: 'An assertion is signed with a key the client registered.',
    },
    {
      id: 'exchange',
      label: 'Exchange',
      description: 'RFC 7523: the assertion stands in for an interactive grant.',
    },
  ],
};
