import { Router } from "express";
import spec from "./openapi.json";

const router = Router();

type RouteEntry = {
  method: string;
  path: string;
  description?: string;
  body?: string;
};

/**
 * The route inventory, derived from `openapi.json` rather than written out a second time.
 *
 * **There used to be three inventories of the same 84 endpoints**: the Express routers, the OpenAPI
 * document, and a hand-maintained `ROUTES` array here — and they had already drifted, in both
 * directions. `openapi.json` was missing `/device` and `/.well-known/openid-credential-issuer`, which
 * only this list knew about; this list was missing nothing the spec had, but implied
 * `/api/.well-known/oauth-authorization-server`, a URL that does not exist. Both were merged into the
 * spec, which is now the only place an endpoint is declared. Adding one there is what makes it appear
 * on the routes page.
 *
 * **Mount prefixes come from OpenAPI's own `servers`**, globally `/api` and overridden per path item
 * for the handful `app.ts` mounts at the true root — `/.well-known/*` and the Device Flow browser page
 * — or at both (`/metrics`, `/.well-known/openid-configuration`, whose routers are mounted twice).
 *
 * **The auth hint is derived from `security`, not prose.** The old descriptions carried "requires Basic
 * auth" by hand, which is exactly the sentence that goes stale when a gate moves. `security` is the
 * structured form of the same fact and is already what the spec publishes.
 *
 * `x-example-body` carries the 41 form/JSON examples the page's curl button copies. They stay as data
 * because no schema can supply a plausible *value* — only the shape.
 */
const SCHEME_LABEL: Record<string, string> = {
  basicAuth: "admin Basic auth",
  bearerAuth: "a Bearer access token",
  dpopAuth: "a DPoP access token",
};

function authHint(security: unknown): string {
  if (!Array.isArray(security) || security.length === 0) return "";
  const names = security.flatMap((req) => Object.keys(req as object));
  const labels = [...new Set(names.map((n) => SCHEME_LABEL[n] ?? n))];
  return labels.length ? ` (requires ${labels.join(" or ")})` : "";
}

const GLOBAL_PREFIX = (spec.servers?.[0]?.url ?? "/api").replace(/\/$/, "");

function buildRoutes(): RouteEntry[] {
  const entries: RouteEntry[] = [];
  for (const [specPath, item] of Object.entries(spec.paths as Record<string, Record<string, any>>)) {
    const { servers, ...operations } = item;
    const prefixes: string[] = Array.isArray(servers)
      ? servers.map((s: { url: string }) => s.url.replace(/\/$/, ""))
      : [GLOBAL_PREFIX];
    // OpenAPI templates a path parameter as `{id}`; Express writes it `:id`.
    const expressPath = specPath.replace(/\{([^}]+)\}/g, ":$1");
    for (const [method, op] of Object.entries(operations)) {
      for (const prefix of prefixes) {
        entries.push({
          method: method.toUpperCase(),
          path: `${prefix}${expressPath}`,
          description: `${op.summary ?? ""}${authHint(op.security)}`,
          ...(op["x-example-body"] ? { body: op["x-example-body"] as string } : {}),
        });
      }
    }
  }
  return entries;
}

const ROUTES: RouteEntry[] = buildRoutes();

// Serve static HTML view from src/views
router.get("/routes", (req, res) => {
  res.render("routes");
});

// Provide a JSON endpoint the client-side view can fetch
router.get("/routes.json", (req, res) => {
  const proto = req.protocol;
  const host = req.get("host") || "localhost";
  const base = `${proto}://${host}`;
  req.logger.info("routes base url", { base });
  res.json({ base, routes: ROUTES });
});

export default router;
