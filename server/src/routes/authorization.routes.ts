import { Router } from "express";
import { authorizationController } from "../controllers/authorization.controller";
import { authLimiter } from "../middleware/rate-limit";

const router = Router();

router.get("/authorization", authLimiter, authorizationController.handleAuthorization);

export default router;
