import { required } from "../utils/env";

export const authleteConfig = {
  baseUrl: required("AUTHLETE_BASE_URL"),
  serviceId: required("AUTHLETE_SERVICE_ID"),
  AccessToken: required("AUTHLETE_BEARER_TOKEN"),
};

export const jwt = {
  privateKey: process.env.JWT_PRIVATE_KEY_PEM || "",
  publicKey: process.env.JWT_PUBLIC_KEY_PEM || "",
  issuer: process.env.JWT_ISSUER || "",
};

export const jwks = {
  uri: process.env.JWKS_URI || "",
};
