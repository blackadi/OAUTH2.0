import { Router } from "express";
import { tokenController } from "../controllers/token.controller";
import { tokenIssueController } from "../controllers/token-issue.controller";
import { tokenFailController } from "../controllers/token-fail.controller";
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

router.post("/token", tokenController.handleToken);
router.post("/token/issue", tokenIssueController.handleIssue);
router.post("/token/fail", tokenFailController.handleFail);
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
