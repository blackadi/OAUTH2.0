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

/**
 * What `POST /api/backchannel_logout` expects of an incoming logout token, when this deployment acts as an
 * **RP** at some other OP (OpenID Connect Back-Channel Logout §2.6 step 4).
 *
 * `issuer` is that OP's issuer identifier; `audience` is this deployment's `client_id` *there*. Both are
 * deliberately separate from `jwt.issuer` above, which describes tokens this server mints itself — reusing
 * that value would compare an incoming token against our own identity and pass nothing legitimate.
 *
 * **Empty means "unconfigured", and unconfigured must refuse rather than skip.** The endpoint answers 500 when
 * either is missing. That is T0-2's ruling applied here: `verify-id-token-hint.ts` deliberately did not fall
 * back to an unset `JWT_ISSUER` because doing so *"would have silently disabled the check"*.
 */
export const backchannelLogout = {
  issuer: process.env.BACKCHANNEL_LOGOUT_ISSUER || "",
  audience: process.env.BACKCHANNEL_LOGOUT_AUDIENCE || "",
};
