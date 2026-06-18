declare module "express-request-id" {
  import { RequestHandler } from "express";

  interface Options {
    uuid?: boolean;
    setHeader?: boolean;
    headerName?: string;
    attributeName?: string;
  }

  export default function expressRequestId(options?: Options): RequestHandler;
}
