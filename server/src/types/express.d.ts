import type { CallableLogger } from "../utils/logger";

declare module "express-serve-static-core" {
  interface Request {
    id?: string;
    logger: CallableLogger;
    rawBody?: string;
  }
}

export {};
