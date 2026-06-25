import { Router } from "express";
import { tokenController } from "../controllers/token.controller";
import { tokenLimiter } from "../middleware/rate-limit";
import {
  tokenCreateController,
  tokenDeleteController,
  tokensListController,
  tokenReissueIdToken,
  tokenRevokeToken,
  tokenUpdateController,
  localSignedToken,
} from "../controllers/token.management.controller";

const router = Router();

router.post("/token", tokenLimiter, tokenController.handleToken);
router.post("/token/create", tokenCreateController.handleCreateToken);
router.delete(
  "/token/delete/:accessTokenIdentifier",
  tokenDeleteController.handleDeleteToken
);
router.get("/token/list", tokensListController.handleListTokens);
router.post("/token/reissue", tokenReissueIdToken.handleReissueIdToken);
router.post("/token/revoke", tokenRevokeToken.handleRevokeToken);
router.patch("/token/update", tokenUpdateController.handleUpdateToken);
router.get("/token/createLocalToken", localSignedToken.handleLocalSignedToken);

export default router;
