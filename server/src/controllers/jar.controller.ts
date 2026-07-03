import { Request, Response } from "express";
import { JarService } from "../services/jar.service";

const jarService = new JarService();

export const jarController = {
  process: async (req: Request, res: Response) => {
    try {
      const { request, clientId } = req.body;

      if (!request) {
        return res.status(400).json({ error: "Missing required field: request" });
      }
      if (!clientId) {
        return res.status(400).json({ error: "Missing required field: clientId" });
      }

      const result = await jarService.process(request, clientId);
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  },
};
