import { Router } from "express";
import {
  backchannelLogoutIssueController,
  backchannelLogoutDeliverController,
  backchannelLogoutDeliverAllController,
} from "../controllers/backchannel-logout.controller";

const router = Router();

// Issue a backchannel logout token (requires admin Basic auth)
router.post("/backchannel_logout/issue", backchannelLogoutIssueController.handleIssueToken);

// Issue + deliver to one client (requires admin Basic auth)
router.post("/backchannel_logout/deliver", backchannelLogoutDeliverController.handleDeliver);

// Issue + deliver to all clients with backchannelLogoutUri (requires admin Basic auth)
router.post("/backchannel_logout/deliver-all", backchannelLogoutDeliverAllController.handleDeliverAll);

export default router;
