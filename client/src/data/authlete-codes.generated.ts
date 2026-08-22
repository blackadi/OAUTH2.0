/**
 * Authlete result codes, extracted from the vendored Authlete OpenAPI document.
 *
 * **Generated — do not edit.** Run `node scripts/extract-authlete-codes.mjs` to regenerate.
 * Source: `docs/openapi-spec.json` (Authlete 3.0.16).
 *
 * Every entry here is the vendor's own `resultMessage` for that `resultCode`, with the HTTP status
 * and the endpoint the document attaches it to. Nothing is paraphrased and nothing is inferred: a code
 * the vendor does not document simply has no entry, and the decoder reports it as unrecognised rather
 * than inventing a cause. Repo-verified guidance is layered on top by hand in `errorDocs.ts`.
 *
 * 38 codes.
 */

export interface AuthleteCode {
  /** The vendor's own message, with its redundant `[Annnnnn]` prefix removed. */
  message: string;
  /** The HTTP status the vendor document attaches to it. */
  status: number;
  /**
   * The Authlete API that produces it, or `null` when the document attaches the code to many
   * operations as boilerplate — in which case `endpointCount` says how many.
   */
  endpoint: string | null;
  endpointCount?: number;
}

export const AUTHLETE_CODES: Record<string, AuthleteCode> = {
  A001101: { message: "/auth/authorization, Authlete Server error.", status: 500, endpoint: null, endpointCount: 83 },
  A001201: { message: "/auth/authorization, TLS must be used.", status: 400, endpoint: null, endpointCount: 83 },
  A001202: { message: "/auth/authorization, Authorization header is missing.", status: 401, endpoint: null, endpointCount: 83 },
  A001215: { message: "/auth/authorization, The client (ID = 26837717140341) is locked.", status: 403, endpoint: null, endpointCount: 83 },
  A004001: { message: "Authlete has successfully issued a ticket to the service (API Key = 21653835348762) for the authorization request from the client (ID = 26478243745571). [response_type=code, openid=false]", status: 200, endpoint: "POST /api/{serviceId}/auth/authorization" },
  A004201: { message: "The authorization request from the service does not contain 'parameters' parameter.", status: 200, endpoint: "POST /api/{serviceId}/auth/authorization/fail" },
  A040001: { message: "The authorization request was processed successfully.", status: 200, endpoint: "POST /api/{serviceId}/auth/authorization/issue" },
  A050001: { message: "The token request (grant_type=authorization_code) was processed successfully.", status: 200, endpoint: "POST /api/{serviceId}/auth/token" },
  A054001: { message: "The token request (grant_type=password) was processed successfully.", status: 200, endpoint: "POST /api/{serviceId}/auth/token/issue" },
  A056001: { message: "The access token is valid.", status: 200, endpoint: "POST /api/{serviceId}/auth/introspection" },
  A067301: { message: "The credentials (username & password) passed to the token endpoint are invalid.", status: 200, endpoint: "POST /api/{serviceId}/auth/token/fail" },
  A091001: { message: "The access token presented at the userinfo endpoint is valid.", status: 200, endpoint: "POST /api/{serviceId}/auth/userinfo" },
  A096001: { message: "An ID token was generated successfully.", status: 200, endpoint: "POST /api/{serviceId}/auth/userinfo/issue" },
  A109001: { message: "An access token was created successfully: authorization_code, client = 26888344961664", status: 200, endpoint: "POST /api/{serviceId}/auth/token/create" },
  A113001: { message: "The token has been revoked successfully.", status: 200, endpoint: "POST /api/{serviceId}/auth/revocation" },
  A135001: { message: "Updated the access token successfully.", status: 200, endpoint: "POST /api/{serviceId}/auth/token/update" },
  A137001: { message: "Deleted 3 access token(s) issued to the client (ID = 26478243745571) of the service (API Key = 21653835348762).", status: 200, endpoint: "DELETE /api/{serviceId}/client/authorization/delete/{clientId}" },
  A138001: { message: "Updated 1 access token(s) issued to the client (ID = 26478243745571) of the service (API Key = 21653835348762).", status: 200, endpoint: "POST /api/{serviceId}/client/authorization/update/{clientId}" },
  A145001: { message: "Introspection was performed successfully (type=access_token, active=true).", status: 200, endpoint: "POST /api/{serviceId}/auth/introspection/standard" },
  A148001: { message: "Successfully refreshed the client secret of the client (ID = 26478243745571).", status: 200, endpoint: "GET /api/{serviceId}/client/secret/refresh/{clientIdentifier}" },
  A149001: { message: "Successfully updated the client secret of the client (ID = 26478243745571).", status: 200, endpoint: "POST /api/{serviceId}/client/secret/update/{clientIdentifier}" },
  A160001: { message: "The JOSE is valid.", status: 200, endpoint: "POST /api/{serviceId}/jose/verify" },
  A179001: { message: "The backchannel authentication request was processed successfully.", status: 200, endpoint: "POST /api/{serviceId}/backchannel/authentication" },
  A183001: { message: "An auth_req_id was issued successfully.", status: 200, endpoint: "POST /api/{serviceId}/backchannel/authentication/issue" },
  A185001: { message: "Successfully generated an error response for the backchannel authentication request.", status: 200, endpoint: "POST /api/{serviceId}/backchannel/authentication/fail" },
  A198001: { message: "Successfully updated the database so that the token endpoint can generate tokens (mode = poll, result = AUTHORIZED).", status: 200, endpoint: "POST /api/{serviceId}/backchannel/authentication/complete" },
  A202001: { message: "The client was created with id 26837717140341.", status: 200, endpoint: "POST /api/{serviceId}/client/registration" },
  A213001: { message: "The client has been updated.", status: 200, endpoint: "POST /api/{serviceId}/client/registration/update" },
  A216001: { message: "The client has been deleted.", status: 200, endpoint: "POST /api/{serviceId}/client/registration/delete" },
  A217001: { message: "The client information has been returned.", status: 200, endpoint: "POST /api/{serviceId}/client/registration/get" },
  A220001: { message: "The device authorization request was processed successfully.", status: 200, endpoint: "POST /api/{serviceId}/device/authorization" },
  A224001: { message: "The user code is valid.", status: 200, endpoint: "POST /api/{serviceId}/device/verification" },
  A241001: { message: "The API call was processed successfully.", status: 200, endpoint: "POST /api/{serviceId}/device/complete" },
  A245001: { message: "Successfully registered a request object for client (5921531358155430), URI is urn:ietf:params:oauth:request_uri:CAK9YEtNorwXE3UwSyihsBOL0jFrqUup7yAACw5y5Zg.", status: 200, endpoint: "POST /api/{serviceId}/pushed_auth_req" },
  A312001: { message: "Revoked 1 access token(s).", status: 200, endpoint: "POST /api/{serviceId}/auth/token/revoke" },
  A501001: { message: "A Native SSO-compliant ID token and a token response were generated successfully.", status: 200, endpoint: "POST /api/{serviceId}/nativesso" },
  A503001: { message: "The /nativesso/logout API call successfully deleted 2 access/refresh token record(s).", status: 200, endpoint: "POST /api/{serviceId}/nativesso/logout" },
  A504001: { message: "The backchannel logout token was successfully issued.", status: 200, endpoint: "POST /api/{serviceId}/backchannel/logout/token" },
};

export const AUTHLETE_SPEC_VERSION = "3.0.16";
