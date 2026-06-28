import { Router } from "express";
import { sessionController } from "../controllers/session.controller";
import { csrfProtection } from "../middleware/csrf";
import { generalLimiter, loginLimiter } from "../middleware/rate-limit";

const router = Router();

router.get("/session/login", generalLimiter, csrfProtection, sessionController.showLogin);
router.post("/session/login", loginLimiter, csrfProtection, sessionController.handleLogin);

router.get("/session/consent", generalLimiter, csrfProtection, sessionController.showConsent);
router.post("/session/consent", generalLimiter, csrfProtection, sessionController.handleConsent);

export default router;
