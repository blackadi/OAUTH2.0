import { Router } from "express";
import { introspectionController } from "../controllers/introspection.controller";
import { introspectionStandardController } from "../controllers/introspection-standard.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

// Both endpoints are token oracles, so both are authenticated and rate-limited.
//
// RFC 7662 §2.1: *"the endpoint MUST also require some form of authorization to access this endpoint, such
// as client authentication"*. Until 2026-08-12 these two routes carried **no middleware at all** — anyone
// who could reach the server could post an arbitrary string and learn whether it was a live token, then
// harvest `sub`, `scope`, `client_id` and `exp` from the hits. The rate limiter matters for the same reason
// the authentication does: §2.1's stated purpose is preventing token scanning, and an unthrottled oracle is
// still an oracle.
//
// The credential is this deployment's **admin** Basic auth, checked inside each controller by
// `requireBasicAuth` — see the note there on why it is not per-client authentication.
router.post("/introspection", generalLimiter, introspectionController.handleIntrospection);
router.post(
  "/introspection/standard",
  generalLimiter,
  introspectionStandardController.handleIntrospectionStandard
);

export default router;
