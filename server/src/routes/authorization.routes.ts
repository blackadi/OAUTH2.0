import { Router } from "express";
import { authorizationController } from "../controllers/authorization.controller";
import { authorizationIssueResponseController } from "../controllers/authorization-response.controller";

const router = Router();

router.get("/authorization", authorizationController.handleAuthorization);
router.post("/authorization/issue", authorizationIssueResponseController.handleAuthorizationIssueResponse);

export default router;
