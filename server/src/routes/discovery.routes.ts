import { Router } from "express";
import { discoveryController } from "../controllers/discovery.controller";

const router = Router();

router.get("/.well-known/openid-configuration", discoveryController.handleDiscovery);

/**
 * The same document at the URL the issuer identifier implies.
 *
 * OpenID Connect Discovery 1.0 §4 locates the configuration at
 * `{issuer}/.well-known/openid-configuration`, and FAPI 2.0 Security Profile §5.3.2.1 requires the
 * server to *"distribute discovery metadata (such as the authorization endpoint) via the metadata
 * document"*. This deployment's issuer is the bare origin, so a conforming client fetches the ROOT
 * path — which reached the SPA catch-all and answered **200 with `index.html`**. That is the RFC 9728
 * failure `AGENTS.md` already records — *"a discovering client sees success and parses a web page"* —
 * landing on the one document every OpenID client fetches first.
 *
 * A **separate router**, not a second `app.use` of the default export, and the distinction is load
 * bearing twice over. `check-client-server-contract.mjs` keys mounted routers by the *identifier* in
 * `app.use`, so mounting one identifier twice makes the later mount overwrite the earlier and the
 * SPA's `/api/.well-known/openid-configuration` reads as resolving to no route at all — which is
 * exactly what happened. `federation.routes.ts` and `vci.routes.ts` already carry this shape for the
 * same reason.
 *
 * Additive: the `/api` path is unchanged, so the SPA and every doc reference keep working.
 */
const rootRouter = Router();
rootRouter.get("/.well-known/openid-configuration", discoveryController.handleDiscovery);

export default router;
export { rootRouter };
