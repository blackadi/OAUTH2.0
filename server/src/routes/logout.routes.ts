import { Router } from "express";
import {
  rpInitiatedLogout,
  showLogoutConfirmation,
  opBackchannelLogout,
} from "../controllers/logout.controller";
import { csrfProtection } from "../middleware/csrf";
import { generalLimiter } from "../middleware/rate-limit";

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
//
// `generalLimiter` (60/min, per IP) closes F-1's second aggravating factor, left out of T0-3 deliberately so
// it stayed legible rather than being folded in outside that item's acceptance criteria. It is the limiter
// this repo already uses for browser-facing session routes (`session.routes.ts`, `device.routes.ts`) and it
// goes before `csrfProtection` for the same reason it does there: reject cheaply before doing token work.
//
// Not `loginLimiter` (5/min) — logout is not a credential-guessing surface, and a limit that tight breaks a
// legitimate pattern: the CSRF token is single-use and the POST destroys the session holding it, so scripted
// logout needs one GET per POST.
router.get("/logout", generalLimiter, csrfProtection, showLogoutConfirmation);
router.post("/logout", generalLimiter, csrfProtection, rpInitiatedLogout);

// OP-initiated backchannel (token-based)
router.post("/backchannel_logout", opBackchannelLogout);

export default router;
