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
      // Claims the user consented to share (passed to Authlete at issue time)
      consentedClaims?: string[];
      // RFC 9470: Authentication requirements from the authorization request
      acrs?: string[];
      acrEssential?: boolean;
      maxAge?: number;
      // Track when the current session authentication occurred (epoch seconds)
      authTime?: number;
      // Claim names the client asked to have in the ID token, from the `claims` request parameter's
      // `id_token` member. The VALUES are built at issue time by `claimValuesFor`; passing the request
      // JSON through as the values is what put `"name": null` in every id_token before 2026-09-01.
      idTokenClaimNames?: string[];
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
