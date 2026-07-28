import { Router } from "express";
import {
  grantManagementQueryController,
  grantManagementRevokeController,
} from "../controllers/grant-management.controller";
import { requireGrantOwnership } from "../middleware/require-grant-ownership";

const router = Router();

// requireGrantOwnership runs first: Authlete's /gm API checks the token but not who owns the grant.
router.get(
  "/gm/:grantId",
  requireGrantOwnership("grant_management_query"),
  grantManagementQueryController.handleQueryGrant
);
router.delete(
  "/gm/:grantId",
  requireGrantOwnership("grant_management_revoke"),
  grantManagementRevokeController.handleRevokeGrant
);

export default router;
