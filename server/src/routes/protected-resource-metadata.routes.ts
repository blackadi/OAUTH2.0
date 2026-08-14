import { Router } from "express";
import { protectedResourceMetadataController } from "../controllers/protected-resource-metadata.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

// RFC 9728 §3 fixes this path at the true root, not under /api.
router.get(
  "/.well-known/oauth-protected-resource",
  generalLimiter,
  protectedResourceMetadataController.handleMetadata,
);

/**
 * The **path-suffixed** form, and it is not decoration — 9728-W1.
 *
 * §3 builds the metadata URL by inserting `/.well-known/oauth-protected-resource` **between the host and the
 * path** of the resource identifier. This deployment advertises `resource` as its UserInfo endpoint, which
 * has a path, so a client following §3 asks for
 *
 *     https://host/.well-known/oauth-protected-resource/api/userinfo
 *
 * and only the path-less route existed. That request fell through to the SPA catch-all, which answers **200
 * with HTML** — the same failure mode this route was created to fix, one URL along. A discovering client
 * sees success and parses a web page.
 *
 * Both forms serve the same document deliberately: the alternative is to force `resource` to be path-less,
 * which would mean claiming the whole issuer is the protected resource when in fact UserInfo is.
 */
router.get(
  "/.well-known/oauth-protected-resource/{*path}",
  generalLimiter,
  protectedResourceMetadataController.handleMetadata,
);

export default router;
