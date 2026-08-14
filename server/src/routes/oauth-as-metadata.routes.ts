import { Router } from "express";
import { discoveryController } from "../controllers/discovery.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

/**
 * RFC 8414 Authorization Server Metadata — served at the true root.
 *
 * **RFC 8414 and OpenID Connect Discovery 1.0 are two distinct documents that overlap**, not one document
 * with two names. RFC 8414 (published, March 2018) defines `oauth-authorization-server` and a metadata set
 * for any OAuth 2.0 AS; OIDC Discovery defines `openid-configuration` and adds the OpenID-specific members
 * (`id_token_signing_alg_values_supported`, `claims_supported`, `subject_types_supported`, …). Their
 * required members differ, and neither is a superset of the other in the general case.
 *
 * **One document is served for both, deliberately.** This deployment is an OpenID Provider, so its
 * OIDC Discovery document is a strict superset of what RFC 8414 requires — every RFC 8414 member a client
 * needs is present, plus OpenID members an RFC 8414 client will ignore. Emitting a second, narrower document
 * would mean maintaining two views of one configuration and inviting them to drift; a plain OAuth client
 * ignoring extra members is the cheaper outcome by a wide margin.
 *
 * **This route also exists because `openid-configuration` is served under `/api` here**, which is itself a
 * departure — see `docs/ARCHITECTURE.md`. So this is the only well-known metadata document this deployment
 * serves at the location its own specification fixes. Do not "simplify" by removing it; a discovering
 * client that builds `{issuer}/.well-known/oauth-authorization-server` would get the SPA catch-all.
 */
router.get(
  "/.well-known/oauth-authorization-server",
  generalLimiter,
  discoveryController.handleDiscovery,
);

export default router;
