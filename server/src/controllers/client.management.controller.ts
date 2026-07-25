import { NextFunction, Request, Response } from "express";
import { ClientManagementService } from "../services/client.management.service";
import { requireBasicAuth } from "../middleware/require-basic-auth";
import logger from "../utils/logger";

const clientManagementService = new ClientManagementService();
const checkAuth = requireBasicAuth("client_management");

export const clientListController = {
  handleListClients: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.list(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client List Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientGetController = {
  handleGetClient: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.get(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Get Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientCreateController = {
  handleCreateClient: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.create(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(201).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Create Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientUpdateController = {
  handleUpdateClient: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.update(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Update Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientDeleteController = {
  handleDeleteClient: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const clientId = req.params.clientId;
      if (!clientId) {
        return res.status(400).json({
          action: "BAD_REQUEST",
          message: "clientId parameter is required",
        });
      }
      await clientManagementService.delete(req);
      return res.status(204).send();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Delete Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientLockFlagController = {
  handleUpdateLockFlag: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.updateLockFlag(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Lock Flag Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientSecretRefreshController = {
  handleRefreshSecret: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.refreshSecret(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Secret Refresh Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientSecretUpdateController = {
  handleUpdateSecret: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.updateSecret(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Secret Update Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientListAuthorizationsController = {
  handleListAuthorizations: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.listAuthorizations(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client List Authorizations Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientUpdateAuthorizationsController = {
  handleUpdateAuthorizations: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.updateAuthorizations(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Update Authorizations Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientDeleteAuthorizationsController = {
  handleDeleteAuthorizations: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.deleteAuthorizations(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Delete Authorizations Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientGetGrantedScopesController = {
  handleGetGrantedScopes: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.getGrantedScopes(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Get Granted Scopes Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientDeleteGrantedScopesController = {
  handleDeleteGrantedScopes: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.deleteGrantedScopes(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Delete Granted Scopes Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientGetRequestableScopesController = {
  handleGetRequestableScopes: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.getRequestableScopes(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Get Requestable Scopes Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientUpdateRequestableScopesController = {
  handleUpdateRequestableScopes: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await clientManagementService.updateRequestableScopes(req);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Update Requestable Scopes Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const clientDeleteRequestableScopesController = {
  handleDeleteRequestableScopes: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      await clientManagementService.deleteRequestableScopes(req);
      return res.status(204).send();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Client Delete Requestable Scopes Response Error", { message: error.message });
      return next(error);
    }
  },
};
