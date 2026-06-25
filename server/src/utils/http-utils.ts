import { Response } from "express";

export function sendApiResponse(
  res: Response,
  status: number,
  body: unknown
): void {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.status(status).json(body);
}
