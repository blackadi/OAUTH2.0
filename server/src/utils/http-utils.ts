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
