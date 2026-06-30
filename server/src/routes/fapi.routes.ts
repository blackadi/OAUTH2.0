import { Router } from "express";
import { fapiController } from "../controllers/fapi.controller";

const router = Router();

router.get("/fapi/config", fapiController.getConfig);
router.get("/fapi/status", fapiController.getStatus);

export default router;
