import { Request, Response } from "express";
import { JarService } from "../services/jar.service";
import { requireBasicAuth } from "../middleware/require-basic-auth";

const jarService = new JarService();

/**
 * `/api/jar/process` is a **debugging surface**, not a specification endpoint — no RFC defines its request
 * or response shape. It exists so a learner can post a Request Object and see how Authlete parses it
 * (`docs/curriculum/modules/05-request-integrity-and-binding/`).
 *
 * That makes admin Basic auth the right posture, and it is not optional: the underlying
 * `/auth/authorization` response carries a **`ticket`**, which is a credential — whoever holds one can drive
 * an authorization to completion. Until 2026-08-13 this endpoint was unauthenticated and returned the whole
 * response object, so it handed tickets (and the full `service` configuration, and `client` metadata) to any
 * caller. The gate runs before the Authlete call, so a rejected caller learns nothing and costs nothing.
 */
const checkAuth = requireBasicAuth("jar");

/**
 * What may be returned, as an **allowlist**. A denylist would leak the next field the SDK adds.
 *
 * `resultMessage` and `scopes` are kept deliberately — they are the entire pedagogical value here
 * (`[A005328]` on a tampered signature; what the signed object actually asked for). `ticket`, `service`
 * and `client` are the ones that must never appear.
 */
const EXPOSED_FIELDS = ["action", "resultCode", "resultMessage", "responseContent", "scopes"] as const;

function mapActionToStatus(action?: string): number {
  switch (action) {
    case "BAD_REQUEST":
      return 400;
    case "INTERNAL_SERVER_ERROR":
      return 500;
    // LOCATION / FORM / NO_INTERACTION / INTERACTION all mean "Authlete parsed it" — the endpoint's
    // job is to report that outcome, not to act on it.
    default:
      return 200;
  }
}

export const jarController = {
  process: async (req: Request, res: Response) => {
    try {
      if (!checkAuth(req, res)) return;

      const { request, clientId } = req.body;

      if (!request) {
        return res.status(400).json({ error: "Missing required field: request" });
      }
      if (!clientId) {
        return res.status(400).json({ error: "Missing required field: clientId" });
      }

      const result = (await jarService.process(request, clientId)) as Record<string, unknown>;

      const body: Record<string, unknown> = {};
      for (const key of EXPOSED_FIELDS) {
        if (result?.[key] !== undefined) body[key] = result[key];
      }

      return res.status(mapActionToStatus(result?.action as string | undefined)).json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  },
};
