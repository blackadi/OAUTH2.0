import { Router } from "express";
import { sessionController } from "../controllers/session.controller";

const router = Router();

router.get("/session/login", sessionController.showLogin);
router.post("/session/login", sessionController.handleLogin);

router.get("/session/consent", sessionController.showConsent);
router.post("/session/consent", sessionController.handleConsent);

export default router;
