import { Router } from "express";
import { rpInitiatedLogout, opBackchannelLogout } from "../controllers/logout.controller";

const router = Router();

// RP-initiated (front-channel redirect)
router.get("/logout", rpInitiatedLogout);

// OP-initiated backchannel (token-based)
router.post("/backchannel_logout", opBackchannelLogout);

export default router;
