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
