export const API_BASE_URL = getEnvVar(
  "VITE_API_BASE_URL",
  "http://localhost:3000"
);

export const CLIENT_ID = getEnvVar("VITE_CLIENT_ID", "your_client_id");
export const CLIENT_SECRET = getEnvVar(
  "VITE_CLIENT_SECRET",
  "your_client_secret"
);
export const REDIRECT_URI = getEnvVar(
  "VITE_REDIRECT_URI",
  "http://localhost:3001/callback"
);
export const DEFAULT_SCOPES = getEnvVar("VITE_SCOPES", "openid profile email");

export const AUTHORIZATION_ENDPOINT = `${API_BASE_URL}/api/authorization`;
export const TOKEN_ENDPOINT = `${API_BASE_URL}/api/token`;
export const USERINFO_ENDPOINT = `${API_BASE_URL}/api/userinfo`;
export const INTROSPECTION_ENDPOINT = `${API_BASE_URL}/api/introspection`;
export const INTROSPECTION_STANDARD_ENDPOINT = `${API_BASE_URL}/api/introspection/standard`;
export const REVOCATION_ENDPOINT = `${API_BASE_URL}/api/revocation`;
export const LOGOUT_ENDPOINT = `${API_BASE_URL}/api/logout`;
export const JWKS_ENDPOINT = `${API_BASE_URL}/api/.well-known/jwks.json`;
export const DISCOVERY_ENDPOINT = `${API_BASE_URL}/api/.well-known/openid-configuration`;

export const TOKEN_CREATE_ENDPOINT = `${API_BASE_URL}/api/token/create`;
export const TOKEN_LIST_ENDPOINT = `${API_BASE_URL}/api/token/list`;
export const TOKEN_UPDATE_ENDPOINT = `${API_BASE_URL}/api/token/update`;
export const TOKEN_REVOKE_ENDPOINT = `${API_BASE_URL}/api/token/revoke`;
export const TOKEN_DELETE_ENDPOINT = `${API_BASE_URL}/api/token/delete`;
export const TOKEN_REISSUE_ENDPOINT = `${API_BASE_URL}/api/token/reissue`;
export const TOKEN_LOCAL_ENDPOINT = `${API_BASE_URL}/api/token/createLocalToken`;

export const CLIENT_LIST_ENDPOINT = `${API_BASE_URL}/api/client/list`;
export const CLIENT_GET_ENDPOINT = `${API_BASE_URL}/api/client/get`;
export const CLIENT_CREATE_ENDPOINT = `${API_BASE_URL}/api/client/create`;
export const CLIENT_UPDATE_ENDPOINT = `${API_BASE_URL}/api/client/update`;
export const CLIENT_DELETE_ENDPOINT = `${API_BASE_URL}/api/client/delete`;
export const CLIENT_FLAG_ENDPOINT = `${API_BASE_URL}/api/client/flag`;
export const CLIENT_SECRET_REFRESH_ENDPOINT = `${API_BASE_URL}/api/client/secret/refresh`;
export const CLIENT_SECRET_UPDATE_ENDPOINT = `${API_BASE_URL}/api/client/secret/update`;
export const CLIENT_AUTH_LIST_ENDPOINT = `${API_BASE_URL}/api/client/auth/list`;
export const CLIENT_AUTH_UPDATE_ENDPOINT = `${API_BASE_URL}/api/client/auth/update`;
export const CLIENT_AUTH_DELETE_ENDPOINT = `${API_BASE_URL}/api/client/auth/delete`;
export const CLIENT_SCOPES_GRANTED_ENDPOINT = `${API_BASE_URL}/api/client/scopes/granted`;
export const CLIENT_SCOPES_REQUESTABLE_ENDPOINT = `${API_BASE_URL}/api/client/scopes/requestable`;

export const GRANT_MANAGEMENT_ENDPOINT = `${API_BASE_URL}/api/gm`;

export const BACKCHANNEL_LOGOUT_ISSUE_ENDPOINT = `${API_BASE_URL}/api/backchannel_logout/issue`;
export const BACKCHANNEL_LOGOUT_DELIVER_ENDPOINT = `${API_BASE_URL}/api/backchannel_logout/deliver`;
export const BACKCHANNEL_LOGOUT_DELIVER_ALL_ENDPOINT = `${API_BASE_URL}/api/backchannel_logout/deliver-all`;

export const DCR_REGISTER_ENDPOINT = `${API_BASE_URL}/api/client/dcr/register`;
export const DCR_GET_ENDPOINT = `${API_BASE_URL}/api/client/dcr/get`;
export const DCR_UPDATE_ENDPOINT = `${API_BASE_URL}/api/client/dcr/update`;
export const DCR_DELETE_ENDPOINT = `${API_BASE_URL}/api/client/dcr/delete`;

export const CIBA_AUTHENTICATION_ENDPOINT = `${API_BASE_URL}/api/ciba/authentication`;
export const CIBA_ISSUE_ENDPOINT = `${API_BASE_URL}/api/ciba/issue`;
export const CIBA_FAIL_ENDPOINT = `${API_BASE_URL}/api/ciba/fail`;
export const CIBA_COMPLETE_ENDPOINT = `${API_BASE_URL}/api/ciba/complete`;

export const PAR_ENDPOINT = `${API_BASE_URL}/api/par`;

export const HEALTH_ENDPOINT = `${API_BASE_URL}/api/health`;
export const HEALTH_AUTHLETE_ENDPOINT = `${API_BASE_URL}/api/health/authlete`;

export const DEV_SERVER = {
  port: parseInt(getEnvVar("VITE_DEV_CLIENT_PORT", "3001")),
  host: getEnvVar("VITE_DEV_CLIENT_HOST", "localhost"),
};

export const PROD_CONFIG = {
  apiBaseUrl: getEnvVar("VITE_PROD_API_BASE_URL", API_BASE_URL),
  redirectUri: getEnvVar("VITE_PROD_REDIRECT_URI", REDIRECT_URI),
};

function getEnvVar(key: string, defaultValue: string): string {
  const value = import.meta.env[key];
  return value || defaultValue;
}

export const isDevelopment = import.meta.env.DEV;
export const isProduction = import.meta.env.PROD;

export function getApiBaseUrl(): string {
  if (isProduction && PROD_CONFIG.apiBaseUrl !== API_BASE_URL) {
    return PROD_CONFIG.apiBaseUrl;
  }
  return API_BASE_URL;
}

export function getRedirectUri(): string {
  if (isProduction && PROD_CONFIG.redirectUri !== REDIRECT_URI) {
    return PROD_CONFIG.redirectUri;
  }
  return REDIRECT_URI;
}
