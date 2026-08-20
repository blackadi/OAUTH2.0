import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * Assign a correlation id to every request, on `req.id` and the `X-Request-Id` response header.
 *
 * This replaces the `express-request-id` package. Two reasons, and the second is the interesting one.
 *
 * **1. The dependency was carrying an advisory it could not shed.** `express-request-id@1.4.1` pins
 * `uuid@3.4.0` (GHSA-w5hq-g745-h8pq). The advisory is not reachable here — it needs v3/v5/v6 with a
 * `buf` argument and the package calls v4 with none — but the only way off it was v3, which is pure
 * ESM against this server's CommonJS build on a `>=22` Node floor where `require(esm)` only landed in
 * 22.12. `crypto.randomUUID()` is native, so the whole dependency is ~10 lines of local code.
 *
 * **2. The inbound header was trusted verbatim, and it lands in an audit log.** `req.id` is written to
 * `logs/audit-*.log` (90-day retention) by `middleware/audit-log.ts` and onto every line of
 * `logs/app-*.log` through the per-request child logger. `express-request-id` adopted whatever
 * `X-Request-Id` the caller sent — verified live: an 8,000-character value reached `req.id` intact.
 *
 * So an inbound value is accepted **only when it is a well-formed UUID**, and otherwise replaced:
 *
 * - a gateway or proxy that sets a real UUID keeps its trace correlation across services;
 * - an attacker can write at most 36 characters of hex into a 90-day log, instead of ~16 KB (Node's
 *   header limit) on every request;
 * - deliberately colliding ids to frustrate audit correlation still needs a valid UUID, which is
 *   distinguishable from the collision-by-arbitrary-string case.
 *
 * CR/LF cannot appear in a header value — Node's parser rejects it and does not honour obs-fold — so
 * log-line injection was never reachable, and this filter is about volume and provenance, not escaping.
 *
 * `req.id` is a **correlation identifier and nothing else**: it is never read for authorization. Grep
 * before changing that — the only consumers are `app.ts`'s child logger and `middleware/audit-log.ts`.
 */

const HEADER = "X-Request-Id";

/** RFC 9562 §4 layout for a version-4, variant-1 UUID. Deliberately strict: v4 is what we mint. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const inbound = req.get(HEADER);
    req.id = inbound && UUID_V4.test(inbound) ? inbound : randomUUID();
    res.setHeader(HEADER, req.id);
    next();
  };
}

export default requestId;
