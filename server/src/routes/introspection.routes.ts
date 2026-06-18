import { Router } from "express";
import { introspectionController } from "../controllers/introspection.controller";
import { introspectionStandardController } from "../controllers/introspection-standard.controller";

const router = Router();

router.post("/introspection", introspectionController.handleIntrospection);
router.post("/introspection/standard", introspectionStandardController.handleIntrospectionStandard);

export default router;
