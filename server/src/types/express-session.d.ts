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
      // RFC 9470: Authentication requirements from the authorization request
      acrs?: string[];
      acrEssential?: boolean;
      maxAge?: number;
      // Track when the current session authentication occurred (epoch seconds)
      authTime?: number;
    };
    // RFC 9470: Step-up authentication context bound to issued tokens
    stepUp?: {
      acr?: string;
      authTime?: number;
    };
    secret?: string;
    saveUninitialized?: string;
    resave?: string;
  }
}
