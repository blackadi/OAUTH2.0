import { Router } from "express";
import { sessionController } from "../controllers/session.controller";
import { csrfProtection } from "../middleware/csrf";
import { generalLimiter, loginLimiter } from "../middleware/rate-limit";

const router = Router();

router.get("/session/login", generalLimiter, csrfProtection, sessionController.showLogin);
router.post("/session/login", loginLimiter, csrfProtection, sessionController.handleLogin);

// RFC 9470 second factor. Same limiter shape as login: a 6-digit code is short and guessable, so the
// POST gets the tight `loginLimiter` rather than `generalLimiter`.
router.get("/session/otp", generalLimiter, csrfProtection, sessionController.showOtp);
router.post("/session/otp", loginLimiter, csrfProtection, sessionController.handleOtp);

router.get("/session/consent", generalLimiter, csrfProtection, sessionController.showConsent);
router.post("/session/consent", generalLimiter, csrfProtection, sessionController.handleConsent);

export default router;
