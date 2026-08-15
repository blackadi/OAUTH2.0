import {
  TokenCreateResponse,
  TokenResponse,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId as defaultServiceId } from "./authlete.service";
import { TokenManagementService } from "./token.operations.service";
import jwt from "jsonwebtoken";

export type JwtBearerResult =
  | { ok: true; response: TokenCreateResponse; accessToken: string; tokenType: string; expiresIn: number; scope: string }
  | { ok: false; status: 400 | 500; body: TokenCreateResponse | { error: string; error_description: string } };

export class JwtVerificationService {
  constructor(
    private authleteApi: Authlete = defaultApi,
    private svcId: string = defaultServiceId,
    private tokenManagementService: TokenManagementService = new TokenManagementService()
  ) {}

  async processJwtBearer(result: TokenResponse): Promise<JwtBearerResult> {
    const assertion = result.assertion;
    if (!assertion) {
      return {
        ok: false,
        status: 400,
        body: { error: "invalid_grant", error_description: "Missing assertion" },
      };
    }

    if (result.clientId === undefined && !result.clientIdAlias) {
      return {
        ok: false,
        status: 400,
        body: { error: "invalid_request", error_description: "This authorization server requires that the client be identifiable." },
      };
    }

    const clientIdentifier = result.clientIdAlias ?? String(result.clientId);

    // `exp` and `clockSkew` are **defence-in-depth, and are unreachable today** — 7523-W2 / 7523-W5.
    //
    // RFC 7523 §3(4) makes `exp` mandatory on an assertion, and this list omitted it. That reads like a hole
    // and is not one: 7523-W1 established live that Authlete refuses a no-`exp` assertion at `/auth/token`
    // with `[A314305]`, *before* it ever answers `JWT_BEARER`, so this method is not reached for one and
    // `/jose/verify` never gets to apply either setting. Both are correct, both are inert while the vendor
    // behaves as observed, and both become load-bearing the day it does not. Do not describe either as
    // closing a vulnerability.
    //
    // `clockSkew` was previously unset, so Authlete's default applied and its value was unknown — a gap the
    // RFC 7523 audit recorded as its own requirement row. 60 s matches §3(4)'s "small leeway" guidance and
    // sits at or below any conventional default, so making it explicit can only tighten or match.
    const verifyResp = await this.authleteApi.joseObject.joseVerifyApi({
      serviceId: this.svcId,
      joseVerifyRequest: {
        jose: assertion,
        clientIdentifier,
        signedByClient: true,
        mandatoryClaims: ["iss", "sub", "aud", "exp"],
        clockSkew: 60,
      },
    });

    if (!verifyResp.valid || !verifyResp.signatureValid) {
      return {
        ok: false,
        status: 400,
        body: { error: "invalid_grant", error_description: "Invalid assertion" },
      };
    }

    const decoded = jwt.decode(assertion, { complete: true });
    if (!decoded || typeof decoded === "string" || !decoded.payload) {
      return {
        ok: false,
        status: 400,
        body: { error: "invalid_grant", error_description: "The assertion failed to be parsed as a JWT." },
      };
    }

    const decodedPayload = decoded.payload as jwt.JwtPayload;
    const subject = decodedPayload.sub;

    if (!subject) {
      return {
        ok: false,
        status: 400,
        body: { error: "invalid_grant", error_description: "The value of the 'sub' claim failed to be extracted from the payload of the assertion." },
      };
    }

    /**
     * ⚠️ **Do not audience-restrict this token with the assertion's `aud`.** 7523-W3, 2026-08-14.
     *
     * This literal used to carry `issuer` and `audience`, read from the decoded assertion. Both were
     * **inert** — `TokenCreateRequest` has 23 properties and neither is among them, and
     * `TokenManagementService.create()` builds its request from named fields and never reads them either,
     * so they were dropped twice over. Nothing ever failed, which is why they survived.
     *
     * **The tidy-looking fix is a security defect.** `audience` here is the assertion's `aud`, and RFC 7523
     * §3(3) requires that claim to identify the **authorization server** — a wrong value earns `[A314314]`
     * from Authlete, which Module 06's lab demonstrates. Renaming the field to `resources` would therefore
     * audience-restrict every JWT-bearer access token to *this AS's own issuer identifier*, making it valid
     * at no resource server anywhere. Authlete accepts that and answers 200. The tokens would simply stop
     * working at their intended API, silently, and the diff would read as a cleanup.
     *
     * The audience a client actually wants comes from the **`resource` request parameter** (RFC 8707 §2.2),
     * which Authlete has already parsed and validated by the time it hands us this response.
     * `accessTokenResources` is its *decision* about the token being issued and wins; `resources` is what
     * the client *asked for* and is the fallback, since at this point in the flow Authlete has issued
     * nothing. Neither is read from a request body here — same rule as `introspection.service.ts` and
     * `userinfo.service.ts`: server-determined fields do not come from the caller.
     */
    const resources = result.accessTokenResources ?? result.resources;

    const createRequest: Record<string, unknown> = {
      grantType: "JWT_BEARER",
      subject,
      clientId: result.clientId,
      scopes: result.scopes,
    };

    if (resources?.length) {
      createRequest.resources = resources;
    }

    const createResp = await this.tokenManagementService.create(createRequest);

    switch (createResp.action) {
      case "OK":
        return {
          ok: true,
          response: createResp,
          accessToken: createResp.accessToken ?? "",
          tokenType: createResp.tokenType || "Bearer",
          expiresIn: createResp.expiresIn ?? 0,
          scope: createResp.scopes?.join(" ") || "",
        };
      case "BAD_REQUEST":
        return { ok: false, status: 400, body: createResp };
      default:
        return { ok: false, status: 500, body: createResp };
    }
  }
}
