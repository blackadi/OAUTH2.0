import { NextFunction, Request, Response } from "express";
import { DeviceService } from "../services/device.service";
import { LoginService } from "../services/login.service";
import logger from "../utils/logger";

const deviceService = new DeviceService();
const loginService = new LoginService();

export const deviceSessionController = {
  showForm: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_code } = req.query as { user_code?: string };
      res.render("device-verification", {
        userCode: user_code || null,
        clientName: null,
        scopes: null,
        error: null,
        success: null,
        done: false,
      });
    } catch (err) {
      next(err);
    }
  },

  verifyCode: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_code } = req.body as { user_code?: string };
      if (!user_code) {
        return res.render("device-verification", {
          userCode: null, clientName: null, scopes: null,
          error: "Please enter a user code.", success: null, done: false,
        });
      }

      const result = await deviceService.verification(user_code);

      if (result.action === "VALID") {
        const clientName = result.clientName || String(result.clientId || "Unknown client");
        const scopes = result.scopes || [];
        return res.render("device-verification", {
          userCode: user_code, clientName, scopes,
          error: null, success: null, done: false,
        });
      }

      if (result.action === "EXPIRED") {
        return res.render("device-verification", {
          userCode: user_code, clientName: null, scopes: null,
          error: "This code has expired. Please try again from your device.", success: null, done: false,
        });
      }

      return res.render("device-verification", {
        userCode: user_code, clientName: null, scopes: null,
        error: "Invalid code. Please check and try again.", success: null, done: false,
      });
    } catch (err) {
      next(err);
    }
  },

  authenticateAndComplete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_code, username, password, result } = req.body as {
        user_code?: string;
        username?: string;
        password?: string;
        result?: string;
      };

      if (!user_code || !result) {
        return res.status(400).send("Missing required fields.");
      }

      if (result === "ACCESS_DENIED") {
        await deviceService.complete(user_code, "ACCESS_DENIED", "unknown");
        return res.render("device-verification", {
          userCode: user_code, clientName: null, scopes: null,
          error: "Access denied. You can close this window.", success: null, done: true,
        });
      }

      if (!username || !password) {
        return res.status(400).send("Missing credentials.");
      }

      const user = await loginService.validateUser(username, password);
      if (!user) {
        const log = req.logger || logger;
        log("Device login failed", { username });
        return res.status(401).send("Invalid credentials.");
      }

      await deviceService.complete(user_code, "AUTHORIZED", user.subject);

      return res.render("device-verification", {
        userCode: user_code, clientName: null, scopes: null,
        error: null,
        success: "Authorization successful! You can now close this window and return to your device.",
        done: true,
      });
    } catch (err) {
      next(err);
    }
  },
};
