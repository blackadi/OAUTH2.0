import { Router } from "express";
import {
  clientListController,
  clientGetController,
  clientCreateController,
  clientUpdateController,
  clientDeleteController,
  clientLockFlagController,
  clientSecretRefreshController,
  clientSecretUpdateController,
  clientListAuthorizationsController,
  clientUpdateAuthorizationsController,
  clientDeleteAuthorizationsController,
  clientGetGrantedScopesController,
  clientDeleteGrantedScopesController,
  clientGetRequestableScopesController,
  clientUpdateRequestableScopesController,
  clientDeleteRequestableScopesController,
} from "../controllers/client.management.controller";

const router = Router();

router.get("/client/list", clientListController.handleListClients);
router.get("/client/get/:clientId", clientGetController.handleGetClient);
router.post("/client/create", clientCreateController.handleCreateClient);
router.patch("/client/update/:clientId", clientUpdateController.handleUpdateClient);
router.delete("/client/delete/:clientId", clientDeleteController.handleDeleteClient);
router.patch("/client/flag/:clientIdentifier", clientLockFlagController.handleUpdateLockFlag);
router.post("/client/secret/refresh/:clientIdentifier", clientSecretRefreshController.handleRefreshSecret);
router.put("/client/secret/update/:clientIdentifier", clientSecretUpdateController.handleUpdateSecret);
router.get("/client/auth/list/:subject", clientListAuthorizationsController.handleListAuthorizations);
router.post("/client/auth/update/:clientId", clientUpdateAuthorizationsController.handleUpdateAuthorizations);
router.delete("/client/auth/delete/:clientId/:subject", clientDeleteAuthorizationsController.handleDeleteAuthorizations);
router.get("/client/scopes/granted/:clientId/:subject", clientGetGrantedScopesController.handleGetGrantedScopes);
router.delete("/client/scopes/granted/:clientId/:subject", clientDeleteGrantedScopesController.handleDeleteGrantedScopes);
router.get("/client/scopes/requestable/:clientId", clientGetRequestableScopesController.handleGetRequestableScopes);
router.put("/client/scopes/requestable/:clientId", clientUpdateRequestableScopesController.handleUpdateRequestableScopes);
router.delete("/client/scopes/requestable/:clientId", clientDeleteRequestableScopesController.handleDeleteRequestableScopes);

export default router;
