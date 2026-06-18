import { Router } from "express";
import { jwksController } from "../controllers/jwks.controller";

const router = Router();

router.get("/.well-known/jwks.json", jwksController.handle);

export default router;
