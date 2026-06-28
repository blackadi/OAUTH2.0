import { Request, Response, NextFunction } from "express";

export const defaultController = {
  handleDefault: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = req.query.code || "No code provided";
      const state = req.query.state || "No state provided";
      const iss = req.query.iss || "No iss provided";

      res.render("index", {
        code,
        title:
          code !== "No code provided"
            ? "Authorization response content(including authorization code)"
            : "NodeJS Authorization Server",
        state,
        iss,
      });
    } catch (error) {
      next(error);
    }
  },
};
