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

export default router;
