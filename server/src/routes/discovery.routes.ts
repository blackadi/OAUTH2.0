import { Router } from "express";
import { discoveryController } from "../controllers/discovery.controller";

const router = Router();

router.get("/.well-known/openid-configuration", discoveryController.handleDiscovery);

export default router;
