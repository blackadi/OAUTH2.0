import { AuthorizationIssueRequest } from "@authlete/typescript-sdk/models";

// Extend express-session types to include 'authorization'
declare module "express-session" {
  interface SessionData {
    user?: string;
    authorization?: {
      resultMessage: string;
      clientId?: number;
      clientName?: string;
      prompt?: string;
      redirectUri?: string;
      authorizationIssueRequest?: AuthorizationIssueRequest;
      nativeSsoRequested?: boolean;
    };
    secret?: string;
    saveUninitialized?: string;
    resave?: string;
  }
}
