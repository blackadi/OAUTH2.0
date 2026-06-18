// Base API URL - supports different environments
export const API_BASE_URL = getEnvVar(
  "VITE_API_BASE_URL",
  "http://localhost:3000"
); // Node Authorization Server

// Client configuration
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

// OAuth endpoints
export const AUTHORIZATION_ENDPOINT = `${API_BASE_URL}/api/authorization`;
export const TOKEN_ENDPOINT = `${API_BASE_URL}/api/token`;
export const JWKS_ENDPOINT = `${API_BASE_URL}/api/.well-known/jwks.json`;

// Development server configuration
export const DEV_SERVER = {
  port: parseInt(getEnvVar("VITE_DEV_CLIENT_PORT", "3001")),
  host: getEnvVar("VITE_DEV_CLIENT_HOST", "localhost"),
};

// Production configuration
export const PROD_CONFIG = {
  apiBaseUrl: getEnvVar("VITE_PROD_API_BASE_URL", API_BASE_URL),
  redirectUri: getEnvVar("VITE_PROD_REDIRECT_URI", REDIRECT_URI),
};

// Helper function to safely get environment variables
function getEnvVar(key: string, defaultValue: string): string {
  const value = import.meta.env[key];
  return value || defaultValue;
}

// Environment detection
export const isDevelopment = import.meta.env.DEV;
console.log(isDevelopment);
export const isProduction = import.meta.env.PROD;

// Get appropriate API base URL based on environment
export function getApiBaseUrl(): string {
  if (isProduction && PROD_CONFIG.apiBaseUrl !== API_BASE_URL) {
    return PROD_CONFIG.apiBaseUrl;
  }
  return API_BASE_URL;
}

// Get appropriate redirect URI based on environment
export function getRedirectUri(): string {
  if (isProduction && PROD_CONFIG.redirectUri !== REDIRECT_URI) {
    return PROD_CONFIG.redirectUri;
  }
  return REDIRECT_URI;
}
