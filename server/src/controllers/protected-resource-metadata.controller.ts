import { NextFunction, Request, Response } from "express";
import { DiscoveryService } from "../services/discovery.service";
import { protectedResource } from "../config/app.config";
import logger from "../utils/logger";

/**
 * OAuth 2.0 Protected Resource Metadata — RFC 9728 (published April 2025).
 *
 * Served at `/.well-known/oauth-protected-resource` on the true root, so a client can discover which
 * authorization server protects this API before it has a token. The client side of this repo already
 * consumes PRM for MCP (`client/src/services/mcp.service.ts`), so without this route the deployment
 * described a document it could not serve — and the SPA catch-all answered the path with 200 and HTML,
 * which is worse than a 404 because a discovering client sees success.
 *
 * `resource` is the only REQUIRED member (§2). Everything else here is optional and advertised because it
 * is cheap and useful: the values are read from the live discovery document so they cannot drift.
 */
export const protectedResourceMetadataController = {
  handleMetadata: async (req: Request, res: Response, next: NextFunction) => {
    const log = req.logger || logger;
    try {
      const raw = await new DiscoveryService().getConfiguration(req);
      // The string branch is **defensive, not required** — 8414-W4, settled 2026-08-14.
      //
      // SDK 1.0.0 types this call `Promise<{ [k: string]: any }>`, i.e. an object, never a string. The
      // comment that used to sit here claimed "Authlete's discovery API may hand back the document as a
      // JSON string or as an object", which is a statement about vendor behaviour that the SDK's own type
      // contradicts and that nobody had observed.
      //
      // Kept rather than deleted, and the reason is the blast radius rather than the branch itself:
      // `services/logout.service.ts` carries the same guard for this document *and* for the JWK Set, that
      // file is a **Security-critical surface** (session termination), and a unit test asserts this
      // endpoint accepts a stringified document. Deleting one arm of a triple is how the two halves drift.
      // The guard costs a `typeof` and cannot misfire — if the SDK's contract ever loosens, it is correct.
      const discovery: Record<string, unknown> =
        typeof raw === "string" ? JSON.parse(raw) : ((raw ?? {}) as Record<string, unknown>);

      // Fall back to the AS's own issuer if no explicit resource identifier is configured. This server
      // is primarily an authorization server and stands in for a resource server via UserInfo, so the
      // UserInfo endpoint is the honest default for "the resource this metadata describes".
      const resource =
        protectedResource.resource ||
        (discovery?.userinfo_endpoint as string | undefined) ||
        (discovery?.issuer as string | undefined);

      if (!resource) {
        // Cannot answer honestly without an identifier, and RFC 9728 §2 makes `resource` REQUIRED.
        log.error("Protected resource metadata: no resource identifier could be determined");
        res.status(500).json({ error: "server_error" });
        return;
      }

      const metadata: Record<string, unknown> = {
        resource,
        authorization_servers: [discovery?.issuer].filter(Boolean),
        // 9728-W2: `body` belongs here because this resource genuinely accepts it. `extractAccessToken`
        // (`utils/dpop.ts`) reads `access_token` from a form-encoded body per RFC 6750 §2.2, so advertising
        // `header` alone understated what UserInfo accepts. `query` is deliberately absent and must stay
        // absent — RFC 9700 §4.3.2 forbids tokens in a URI query parameter, and this server implements
        // §2.3 nowhere.
        bearer_methods_supported: ["header", "body"],
      };

      if (Array.isArray(discovery?.scopes_supported)) {
        metadata.scopes_supported = discovery.scopes_supported;
      }
      if (Array.isArray(discovery?.dpop_signing_alg_values_supported)) {
        metadata.dpop_signing_alg_values_supported = discovery.dpop_signing_alg_values_supported;
      }
      if (protectedResource.documentation) {
        metadata.resource_documentation = protectedResource.documentation;
      }

      res.setHeader("Cache-Control", "no-store");
      res.status(200).type("application/json").json(metadata);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error("Protected resource metadata error", { message: error.message });
      next(error);
    }
  },
};
