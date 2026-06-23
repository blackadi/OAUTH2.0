import { Router } from "express";
import { healthController } from "../controllers/health.controller";

const router = Router();

router.get("/health", healthController.serverHealth);
router.get("/health/authlete", healthController.authleteHealth);

export default router;
