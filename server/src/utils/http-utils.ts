import { Response } from "express";

export function sendApiResponse(
  res: Response,
  status: number,
  body: unknown
): void {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.status(status).json(body);
}

/**
 * Send Authlete's `responseContent` as the response body — the **specification's** shape, not the vendor's.
 *
 * **T1-11.** `/api/par`, `/api/device/authorization` and `/api/client/dcr/*` each advertise an RFC, and each
 * used to answer with Authlete's internal envelope: camelCase field names alongside `action`, `resultCode`
 * and `resultMessage`. A conforming client reading RFC 9126 §2.2 looks for `request_uri` and `expires_in`;
 * it found `requestUri` and an `action`. `responseContent` **is** the specification-shaped body — verified by
 * probe (8628-W6: Authlete's own `responseContent` at `/device/authorization` is exactly RFC 8628 §3.2's
 * snake_case JSON), so this is a matter of forwarding what the vendor already produced rather than building
 * anything. `token.controller.ts` has always done it this way; these endpoints were the inconsistency.
 *
 * **Two deliberate choices.**
 *
 * The envelope is the **fallback**, not an error. When `responseContent` is absent there is no spec-shaped
 * body to send, and an empty response would tell a caller nothing — the envelope at least carries Authlete's
 * `resultMessage`. This is the same reasoning that kept `responseContent: null` visible on `/api/jar/process`.
 *
 * **Error bodies go through here too.** On a failure `responseContent` carries the RFC's error object
 * (`{"error":"invalid_request", …}`), which is precisely the part a client is required to parse. Returning
 * the envelope on errors while returning the spec shape on success would be the worse of both.
 *
 * Not for every Authlete-backed endpoint: one with **no specification shape** — `/api/jar/process`,
 * `/api/device/verification`, `/api/device/complete` — has nothing to forward and keeps `sendApiResponse`.
 * `DeviceVerificationResponse` and `DeviceCompleteResponse` do not even have a `responseContent` member.
 */
export function sendSpecBody(
  res: Response,
  status: number,
  result: { responseContent?: string | null } & Record<string, unknown>
): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json");

  const content = result?.responseContent;
  if (typeof content === "string" && content !== "") {
    res.status(status).send(content);
    return;
  }
  res.status(status).json(result);
}

/**
 * The status code for every redirect in the authorization flow.
 *
 * FAPI 2.0 Security Profile §5.3.2.2: the authorization server *"shall not use the HTTP 307 status
 * code when redirecting a request to a different endpoint … should use the HTTP 303 status code"*.
 *
 * **The reason is method preservation, not the number.** A 307 keeps the method *and the body* on
 * the redirected request, so credentials POSTed to the login or consent endpoint would be replayed
 * verbatim to whatever the `Location` names. A 303 requires the user agent to switch to GET and drop
 * the body, which is the property the profile is actually buying. 302 was never 307 — the `shall not`
 * was already satisfied — but its behaviour after a POST is historically ambiguous, which is why
 * §5.3.2.2 names 303 rather than "anything but 307".
 *
 * A named constant rather than a literal at each of the six call sites: the value is a compliance
 * requirement with a citation, and a seventh redirect added later should not have to rediscover it.
 *
 * **Not applied to RP-initiated logout** (`logout.service.ts`). That redirect is OpenID Connect
 * RP-Initiated Logout, not the authorization response §5.3.2.2 governs, so changing it would be
 * churn without a compliance argument.
 */
export const AUTHORIZATION_REDIRECT_STATUS = 303;
