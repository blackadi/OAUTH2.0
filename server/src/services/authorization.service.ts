import { Request } from "express";
import {
  AuthorizationFailRequestReason,
  AuthorizationFailResponse,
  AuthorizationIssueRequest,
  AuthorizationIssueResponse,
  AuthorizationResponse,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import session from "express-session";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";
import crypto from "crypto";
import { claimValuesFor } from "../utils/demo-claims";

export class AuthorizationService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  /**
   * Forward an authorization request to Authlete's `/auth/authorization` API.
   *
   * **9101-W5. This used to send the request object itself.** `reqBody` *is* `req.query` (or `req.body`),
   * and it was mutated with a `parameters` key and then passed straight through as the
   * `AuthorizationRequest` — so every parameter the client sent was also offered to Authlete as a
   * top-level field of the vendor request.
   *
   * **Not exploitable, and establishing that is why this was S4 rather than higher.** `AuthorizationRequest`
   * has exactly three members — `parameters`, `context`, `cimdOptions` — and the SDK's outbound `z.object`
   * strips the rest. There is **no `clientCertificate` member on this request type**, so the RFC 8705
   * injection that would matter here is impossible. What did survive was `context`:
   * `GET /api/authorization?context=…` set the arbitrary text Authlete attaches to the ticket.
   *
   * It is still the anti-pattern the repo deliberately removed from `userinfo.service.ts` and
   * `introspection.service.ts`, and **`jar.service.ts` already did it right** — so this makes two siblings
   * that call the same Authlete API agree, rather than inventing a rule. **Build the Authlete request from
   * named fields; never by handing over client input.** The next member Authlete adds to this request type
   * is then a decision somebody makes, not a query parameter somebody discovers.
   *
   * The `req.query` mutation is gone with it. Nothing read it — `authorization.controller.ts` reads
   * `req.query.prompt` and `req.query.properties` directly — and a service that quietly rewrites the Express
   * request it was handed is a trap for the next reader.
   */
  async process(req: Request): Promise<AuthorizationResponse> {
    // Convert Express request into a query string
    const reqBody =
      req.method === "GET" ? req.query : req.body;
    const log = req.logger || logger;
    log.info("Authorization request parameters", { params: reqBody });

    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(reqBody)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }

    // Call Authlete /authorization API
    const response = await this.authleteApi.authorization.processRequest({
      serviceId: serviceId,
      authorizationRequest: { parameters: params.toString() },
    });

    return response;
  }

  async fail(
    ticket: string,
    reason: AuthorizationFailRequestReason
  ): Promise<AuthorizationFailResponse> {
    const response = await this.authleteApi.authorization.fail({
      serviceId,
      authorizationFailRequest: {
        ticket,
        reason,
      },
    });

    return response;
  }

  async issue(
    req: Request & { session: Partial<session.SessionData> }
  ): Promise<AuthorizationIssueResponse> {
    const ticket = req.session.authorization?.authorizationIssueRequest?.ticket;
    const subject = req.session.user;

    if (!ticket) {
      throw new AppError(
        "Missing ticket in session - authorization context lost",
        400
      );
    }

    if (!subject) {
      throw new AppError(
        "Missing user subject in session - user not authenticated",
        401
      );
    }

    if (req.session.authorization?.authorizationIssueRequest) {
      req.session.authorization.authorizationIssueRequest.subject = subject;
    }

    const log = req.logger || logger;
    const reqBody: AuthorizationIssueRequest = {
      ...req.session.authorization?.authorizationIssueRequest,
    } as AuthorizationIssueRequest;

    // Pass consented claims to Authlete so they are stored and later
    // returned in /auth/userinfo and /auth/introspection responses.
    if (req.session.authorization?.consentedClaims) {
      reqBody.consentedClaims = req.session.authorization.consentedClaims;
      log.info("Passing consented claims to Authlete", {
        consentedClaims: reqBody.consentedClaims,
      });
    }

    /**
     * The ID token's claim **values** — the same ones `/api/userinfo` returns, from the one shared
     * source, so the two can no longer disagree.
     *
     * This field used to be set in `authorization.controller.ts` to `result.idTokenClaims`, which is
     * the claims *request* rather than the claim values: `{"name":null,…}`, where OIDC's claims-request
     * syntax uses `null` to mean *"no special requirements"*. Authlete embedded it verbatim, so every
     * id_token came back with `"name": null` while userinfo returned `"name": "admin"` for the same
     * claim. `fapi2-security-profile-final-test-claims-parameter-identity-claims` reported 21 invalid
     * claims plus *"Value of name **differs** between id_token and userinfo"* — `differs`, because a
     * `null` claim is present-but-invalid rather than absent.
     *
     * Only claims the client asked for by name reach here; `claimValuesFor` omits any it has no value
     * for, per OIDC Core §5.1. So an empty object is possible, and is not worth a round trip.
     */
    const idTokenClaimNames = req.session.authorization?.idTokenClaimNames ?? [];
    if (idTokenClaimNames.length) {
      const values = claimValuesFor(subject, idTokenClaimNames);
      if (Object.keys(values).length) {
        reqBody.claims = JSON.stringify(values);
      }
      // Names only, never values — these are the end-user's name, email and locale, and this log is
      // retained for 14 days. Same rule as the request-body logging in `token.service.ts`.
      log.info("Supplying ID token claim values to Authlete", {
        requested: idTokenClaimNames,
        supplied: Object.keys(values),
      });
    }

    // RFC 9470: Pass authentication context to Authlete so it binds
    // acr and auth_time to the access token (and ID token).
    // These come from session.stepUp set during the login flow.
    if (req.session.stepUp) {
      if (req.session.stepUp.acr !== undefined) reqBody.acr = req.session.stepUp.acr;
      if (req.session.stepUp.authTime !== undefined) reqBody.authTime = req.session.stepUp.authTime;
      log.info("RFC 9470: binding step-up auth context to tokens", {
        acr: req.session.stepUp.acr,
        authTime: req.session.stepUp.authTime,
      });
    }

    // For Native SSO: generate a sessionId and include it in the issue request
    // when nativeSsoRequested is true
    if (req.session.authorization?.nativeSsoRequested) {
      const sessionId = crypto.randomUUID();
      reqBody.sessionId = sessionId;
      log.info("Native SSO: generated sessionId for authorization issue", { sessionId });
    }

    // `claims` and `properties` are redacted, not omitted — knowing they were sent is useful, knowing
    // their contents is a disclosure. `claims` now carries the end-user's name, email and locale (it
    // previously carried the claims *request*, which was harmless, so this line was safe until the fix
    // above); `properties` is arbitrary caller-supplied data. Everything else here is an identifier or a
    // timestamp. Same rule as `token.service.ts`, which logs a body's length and never its value.
    const { claims, properties, ...loggable } = reqBody;
    log.info("Issue authorization request parameters", {
      params: loggable,
      ...(claims ? { claimNames: Object.keys(JSON.parse(claims)) } : {}),
      ...(properties ? { propertyCount: properties.length } : {}),
    });

    const response = await this.authleteApi.authorization.issue({
      serviceId,
      authorizationIssueRequest: reqBody,
    });

    return response;
  }
}
