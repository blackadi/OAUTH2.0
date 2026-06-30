import { Response } from "express";

export function setDpopNonce(res: Response, dpopNonce?: string): void {
  if (dpopNonce) {
    res.setHeader("DPoP-Nonce", dpopNonce);
  }
}
