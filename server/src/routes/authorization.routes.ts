import { Router } from "express";
import { authorizationController } from "../controllers/authorization.controller";

const router = Router();

router.get("/authorization", authorizationController.handleAuthorization);

export default router;
