import { Router } from "express";
import {
  deviceAuthorizationController,
  deviceVerificationController,
  deviceCompleteController,
} from "../controllers/device.controller";
import { deviceSessionController } from "../controllers/device-session.controller";
import { csrfProtection } from "../middleware/csrf";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

// API endpoints (full paths since router is mounted at "/")
router.post("/api/device/authorization", deviceAuthorizationController.handle);
router.post("/api/device/verification", deviceVerificationController.handle);
router.post("/api/device/complete", deviceCompleteController.handle);

// Browser-based verification flow
router.get("/device", generalLimiter, csrfProtection, deviceSessionController.showForm);
router.post("/device", generalLimiter, csrfProtection, deviceSessionController.verifyCode);
router.post("/device/consent", generalLimiter, csrfProtection, deviceSessionController.authenticateAndComplete);

export default router;
