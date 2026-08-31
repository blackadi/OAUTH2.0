import type { Logger } from "winston";

declare module "express-serve-static-core" {
  interface Request {
    id?: string;
    logger: Logger;
    rawBody?: string;
  }
}

export {};
