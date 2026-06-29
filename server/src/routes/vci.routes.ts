import { Router } from "express";
import {
  vciMetadataController,
  vciJwtIssuerController,
  vciJwksController,
  vciOfferController,
  vciCredentialController,
  serviceInstance,
  sendDiscoverResponse,
  DISCOVERY_MAP,
  statusForAction,
} from "../controllers/vci.controller";
import { generalLimiter } from "../middleware/rate-limit";
const router = Router();

// Group 1: VCI Discovery (public, no auth)
router.get("/vci/metadata", generalLimiter, vciMetadataController.handleMetadata);
router.get("/vci/jwtissuer", generalLimiter, vciJwtIssuerController.handleJwtIssuer);
router.get("/vci/jwks", generalLimiter, vciJwksController.handleJwks);
router.get("/vci/well-known", generalLimiter, vciMetadataController.handleMetadata); // same as metadata, convenience for dev UI

// Group 2: VCI Offer Management (admin Basic auth)
// These are internal/admin-only endpoints for creating and querying credential offers.
router.post("/vci/offer/create", generalLimiter, vciOfferController.handleCreateOffer);
router.post("/vci/offer/info", generalLimiter, vciOfferController.handleGetOfferInfo);

// Group 3: VCI Credential Endpoints (OID4VCI 1.0 Final - §§8-10)
// These map to the OID4VCI spec:
//   §8  - Credential Endpoint  → POST /vci/credential/issue
//   §9  - Deferred Credential  → POST /vci/deferred/issue
//   §10 - Batch Credential     → POST /vci/credential/batch
// All accept Authorization: Bearer <token> (with fallback to accessToken in body).
router.post("/vci/credential/issue", generalLimiter, vciCredentialController.handleIssueSingle);
router.post("/vci/credential/batch", generalLimiter, vciCredentialController.handleBatchIssue);
router.post("/vci/deferred/issue", generalLimiter, vciCredentialController.handleIssueDeferred);

// Group 4: Well-Known Credential Issuer Metadata (OID4VCI §12.2)
// Served at /.well-known/openid-credential-issuer for spec compliance.
const wellKnownRouter = Router();
wellKnownRouter.get(
  "/.well-known/openid-credential-issuer",
  generalLimiter,
  async (req, res, next) => {
    try {
      const result = await serviceInstance.getMetadata(true);
      const status = statusForAction(result.action, DISCOVERY_MAP);
      if (status !== 200) {
        res.status(status).json(result);
        return;
      }
      sendDiscoverResponse(res, result, "Metadata");
    } catch (err) {
      next(err);
    }
  }
);

export default router;
export { wellKnownRouter };
