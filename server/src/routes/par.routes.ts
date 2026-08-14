import { Router } from "express";
import { parController } from "../controllers/par.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

router.post("/par", generalLimiter, parController.handle);

/**
 * 9126-W3 — anything but POST gets a **405 with `Allow: POST`**, not the SPA catch-all.
 *
 * RFC 9126 §2 defines the pushed authorization request endpoint as taking POST. Without this, `GET /api/par`
 * fell through to the root catch-all and answered **200 with an HTML page** — so a client that used the wrong
 * verb was told it had succeeded. RFC 9110 §15.5.6 requires the `Allow` header on a 405, which is what makes
 * the answer actionable rather than merely correct.
 */
router.all("/par", generalLimiter, (_req, res) => {
  res.setHeader("Allow", "POST");
  res.status(405).json({
    error: "invalid_request",
    error_description: "The pushed authorization request endpoint accepts POST only (RFC 9126 Section 2).",
  });
});

export default router;
