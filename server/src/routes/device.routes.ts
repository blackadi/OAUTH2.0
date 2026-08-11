import { Router } from "express";
import {
  deviceAuthorizationController,
  deviceVerificationController,
  deviceCompleteController,
} from "../controllers/device.controller";
import { deviceSessionController } from "../controllers/device-session.controller";
import { csrfProtection } from "../middleware/csrf";
import { deviceCodeLimiter, generalLimiter } from "../middleware/rate-limit";
import { developmentOnly } from "../middleware/development-only";

const router = Router();

// API endpoints (full paths since router is mounted at "/")
//
// `/authorization` stays public: it is RFC 8628 §3.1's device authorization endpoint, it is advertised in the
// discovery document, and Authlete authenticates the client from the body credentials. It only gains a limiter.
//
// `/verification` reports whether a user code exists, so unlimited attempts are a code-enumeration oracle —
// RFC 8628 §5.1 asks for rate limiting, hence `deviceCodeLimiter` rather than the 60/min general one.
//
// `/complete` is **development-only**. It records approval as any subject the caller names, with no
// authentication of that subject, so in production it is a token-minting oracle. The authenticated path is
// `POST /device/consent` below, which is available in every environment.
router.post("/api/device/authorization", generalLimiter, deviceAuthorizationController.handle);
router.post("/api/device/verification", deviceCodeLimiter, deviceVerificationController.handle);
router.post("/api/device/complete", developmentOnly, deviceCodeLimiter, deviceCompleteController.handle);

// Browser-based verification flow
router.get("/device", generalLimiter, csrfProtection, deviceSessionController.showForm);
router.post("/device", deviceCodeLimiter, csrfProtection, deviceSessionController.verifyCode);
router.post("/device/consent", generalLimiter, csrfProtection, deviceSessionController.authenticateAndComplete);

export default router;
