export interface AdminAuth {
  clientId: string;
  clientSecret: string;
}

export interface BasicAuth {
  username: string;
  password: string;
}

export interface TokenAdminCreate {
  grantType: string;
  clientId: string;
  subject?: string;
  scopes?: string;
  accessTokenDuration?: string;
}

export interface TokenAdminUpdate {
  accessToken: string;
  scopes?: string;
  accessTokenExpiresAt?: string;
}

export interface TokenAdminRevoke {
  accessTokenIdentifier: string;
}

export interface TokenAdminReissue {
  accessToken: string;
  refreshToken: string;
}

export interface LocalTokenParams {
  iss: string;
  sub: string;
  aud: string;
}

export interface ClientAuthUpdate {
  subject: string;
  scopes?: string;
}

export interface RequestableScopesUpdate {
  requestableScopes: string[];
}

export interface HealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
}

export interface AuthleteHealthResponse {
  healthy: boolean;
  statusCode?: number;
  body?: string;
  error?: string;
}
