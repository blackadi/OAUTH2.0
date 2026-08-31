import { Router, Request, Response } from "express";
import spec from "./openapi.json";

/**
 * The OpenAPI document lives in `openapi.json`, not in this file.
 *
 * It was 2,000 lines of object literal in a `.ts` file with no interpolation and no computed value —
 * JSON wearing a TypeScript costume, paying for a typecheck and a lint pass on every build to describe
 * data. `resolveJsonModule` imports it and `tsc` copies it into `dist/routes/`, so the build output is
 * unchanged and the served document is byte-for-byte what it was.
 *
 * `routes-list.routes.ts` derives `/routes.json` from `spec.paths`. Adding an endpoint here is what
 * makes it appear there; there is no second inventory to keep in step.
 */
const router = Router();

router.get("/openapi.json", (_req: Request, res: Response) => {
  res.json(spec);
});

export default router;
