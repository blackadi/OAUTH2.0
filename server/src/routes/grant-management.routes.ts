import { Router } from "express";
import {
  grantManagementQueryController,
  grantManagementRevokeController,
} from "../controllers/grant-management.controller";

const router = Router();

router.get("/gm/:grantId", grantManagementQueryController.handleQueryGrant);
router.delete("/gm/:grantId", grantManagementRevokeController.handleRevokeGrant);

export default router;
