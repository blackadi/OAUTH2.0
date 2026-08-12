import { Router } from "express";
import {
  rpInitiatedLogout,
  showLogoutConfirmation,
  opBackchannelLogout,
} from "../controllers/logout.controller";
import { csrfProtection } from "../middleware/csrf";

const router = Router();

// RP-initiated logout is two-step, and it has to be.
//
// RP-Initiated Logout 1.0 §2: *"the OP MUST ask the End-User this question if an `id_token_hint` was not
// provided or if the supplied ID Token does not belong to the current OP session."* This deployment asks
// unconditionally, which also satisfies the SHOULD in the sentence before it.
//
// The GET renders a confirmation page carrying a CSRF token; only the POST ends the session, delivers
// back-channel logout tokens, or redirects. Before this the GET did all three with no middleware at all,
// which made `<img src="…/api/logout">` on any page a working logout. Same GET-renders / POST-validates
// arrangement as `routes/device.routes.ts`.
router.get("/logout", csrfProtection, showLogoutConfirmation);
router.post("/logout", csrfProtection, rpInitiatedLogout);

// OP-initiated backchannel (token-based)
router.post("/backchannel_logout", opBackchannelLogout);

export default router;
