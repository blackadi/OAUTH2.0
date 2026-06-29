import { Router } from "express";
import {
  federationConfigurationController,
  federationRegistrationController,
} from "../controllers/federation.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

// API routes (under /api)
router.get("/federation/configuration", generalLimiter, federationConfigurationController.handleConfiguration);
router.get("/.well-known/openid-federation", generalLimiter, federationConfigurationController.handleConfiguration);
router.post("/federation/registration", generalLimiter, federationRegistrationController.handleRegistration);

// Root-level well-known for spec compliance (mounted at / separately)
const rootRouter = Router();
rootRouter.get("/.well-known/openid-federation", generalLimiter, federationConfigurationController.handleConfiguration);

export default router;
export { rootRouter };
