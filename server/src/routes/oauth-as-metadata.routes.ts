import { Router } from "express";
import { discoveryController } from "../controllers/discovery.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

// MCP spec (RFC 8414) requires /.well-known/oauth-authorization-server
// This serves the same OpenID Connect Discovery document for compatibility.
router.get(
  "/.well-known/oauth-authorization-server",
  generalLimiter,
  discoveryController.handleDiscovery,
);

export default router;
