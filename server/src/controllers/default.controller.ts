import { Request, Response } from "express";

export const defaultController = {
  //GET handler using index.ejs
  handleDefault: async (req: Request, res: Response) => {
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
  },
};
