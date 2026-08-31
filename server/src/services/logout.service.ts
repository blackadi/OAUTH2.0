import { Request, Response } from "express";
import session from "express-session";
import logger from "../utils/logger";
import { BackchannelLogoutService } from "./backchannel-logout.service";
import { DiscoveryService } from "./discovery.service";
import { JwksService } from "./jwks.service";
import { HintVerificationJwk, verifyIdTokenHint } from "../utils/verify-id-token-hint";

/** The OP's own signing keys and advertised issuer — everything needed to verify an `id_token_hint`. */
export interface OpVerificationMaterial {
  jwks: HintVerificationJwk[];
  issuer: string;
}

/**
 * Fetch this OP's verification material, cached for five minutes.
 *
 * Both values are read from **live** sources rather than configuration, for the reason `AGENTS.md` gives for
 * `protected-resource-metadata.routes.ts`: derived values cannot drift. Specifically:
 *
 * - **Keys** come from Authlete's service JWKS, not from `JWKS_URI`. That env var is unset on this
 *   deployment (it is the root of the back-channel logout failure recorded as BCL-W3), so reusing it would
 *   have made hint verification fail for a reason unrelated to the hint.
 * - **The issuer** comes from the discovery document, not from `JWT_ISSUER`. That config exists for
 *   locally-minted development JWTs and is unset here; using it would silently disable the `iss` check.
 *
 * The five-minute TTL matches `utils/jwksClient.ts`'s default. Logout is not a hot path, so two Authlete
 * calls per cache window is not worth optimising further.
 */
const MATERIAL_TTL_MS = 300_000;
let materialCache: { expires: number; value: OpVerificationMaterial } | null = null;

/**
 * The cache is process-wide and deliberately has no reset hook: tests inject the whole provider through
 * `rpInitiatedLogoutService`'s second constructor argument, so nothing test-facing ever reaches this cache.
 */
async function fetchOpVerificationMaterial(req: Request): Promise<OpVerificationMaterial> {
  const now = Date.now();
  if (materialCache && materialCache.expires > now) return materialCache.value;

  const [rawJwks, rawDiscovery] = await Promise.all([
    new JwksService().serviceJwksGetApi(),
    new DiscoveryService().getConfiguration(req),
  ]);

  // Authlete hands both documents back as either a JSON string or an object, so both shapes are handled —
  // the same defensive parse `protected-resource-metadata.controller.ts:24-25` uses.
  const jwksDoc: Record<string, unknown> =
    typeof rawJwks === "string" ? JSON.parse(rawJwks) : ((rawJwks ?? {}) as Record<string, unknown>);
  const discovery: Record<string, unknown> =
    typeof rawDiscovery === "string"
      ? JSON.parse(rawDiscovery)
      : ((rawDiscovery ?? {}) as Record<string, unknown>);

  const value: OpVerificationMaterial = {
    jwks: Array.isArray(jwksDoc.keys) ? (jwksDoc.keys as HintVerificationJwk[]) : [],
    issuer: typeof discovery.issuer === "string" ? discovery.issuer : "",
  };

  materialCache = { expires: now + MATERIAL_TTL_MS, value };
  return value;
}

/**
 * The `post_logout_redirect_uris` registered for a client, from `POST_LOGOUT_REDIRECT_URIS`.
 *
 * **Why this lives here and not in Authlete.** RP-Initiated Logout §3 requires matching against the client's
 * *previously registered* values, which means the OP must hold a per-client registry. **Authlete 3.0 has no
 * such field** — verified 2026-08-12 against the vendored `docs/openapi-spec.json` (3.0.16): none of the
 * `Client` schema's 108 properties contains "post", no schema of the 33 defines a post-logout member, and
 * `ClientExtension` does not carry one either. Its only client-level logout fields are
 * `backchannelLogoutUri` and `backchannelLogoutSessionRequired`. A write of `postLogoutRedirectUris` through
 * `client/update` returns **200 and is silently discarded** — confirmed live, on all three clients, with no
 * other field disturbed.
 *
 * So the registry is this deployment's own. The departure from §3 is now **where the registration is stored**,
 * not what the rule is: the comparison is per-client and exact, which is the security property §3 exists to
 * provide. The previous design was neither — one deployment-wide origin allowlist meant *any* client could
 * redirect to *any* allowed origin.
 *
 * Format — a JSON object mapping client identifier to an array of exact URIs:
 *
 * ```
 * POST_LOGOUT_REDIRECT_URIS={"4277838306":["http://localhost:3000"],"1523514379":["http://localhost:3001"]}
 * ```
 *
 * Unset, unparseable, or missing the client ⇒ **empty set**, which `isAllowedPostLogoutRedirectUri` refuses.
 * That is §3's own answer for a client with nothing registered, so failing closed here is conformance rather
 * than caution.
 */
export function registeredPostLogoutRedirectUris(clientId: string | undefined): string[] {
  if (!clientId) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(process.env.POST_LOGOUT_REDIRECT_URIS || "{}");
  } catch {
    return []; // malformed configuration must not widen anything
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const entry = (parsed as Record<string, unknown>)[clientId];
  if (!Array.isArray(entry)) return [];

  return entry.filter((uri): uri is string => typeof uri === "string" && uri.length > 0);
}

/**
 * Decide whether the OP may redirect the user agent to a supplied `post_logout_redirect_uri`.
 *
 * **OpenID Connect RP-Initiated Logout 1.0 §3:** *"The OP also MUST NOT perform post-logout redirection if the
 * `post_logout_redirect_uri` value supplied does not exactly match one of the previously registered
 * `post_logout_redirect_uris` values."*
 *
 * *"Exactly match"* means byte-for-byte string equality against a registered value, so that is all this does.
 * The comparison is `===` per element — **not** `String.prototype.includes`, which is substring matching and
 * is the trap the older origin-based version warned about; `Array.prototype.some(u => u === candidate)` is
 * element equality and is a different operation entirely.
 *
 * **No parsing, and that is the point.** The previous version parsed with `new URL()` and compared origins,
 * because it was matching against *origins* from `ALLOWED_ORIGINS` and needed to know where the host ended.
 * Matching against full registered URIs needs none of that: `http://localhost:3000.evil.example.com/bye` and
 * `http://localhost:3001@evil.example.com/` — the two payloads verified live before 2026-08-10 — are refused
 * for the plain reason that nobody registered them, as is every other value nobody registered. A comparison
 * with no parser has no parser bugs.
 *
 * An empty registered set refuses everything, which is §3's requirement for a client that has registered
 * nothing, not a degraded fallback.
 */
export function isAllowedPostLogoutRedirectUri(
  candidate: string,
  registered: string[]
): boolean {
  if (!candidate || registered.length === 0) return false;

  return registered.some((uri) => uri === candidate);
}

export class rpInitiatedLogoutService {
  constructor(
    private backchannelLogoutService: BackchannelLogoutService = new BackchannelLogoutService(),
    private verificationMaterial: (req: Request) => Promise<OpVerificationMaterial> = fetchOpVerificationMaterial
  ) {}

  async rpInitiatedLogout(
    req: Request & { session: Partial<session.SessionData> },
    res: Response
  ) {
    const log = req.logger || logger;

    const { id_token_hint, post_logout_redirect_uri, state, client_id, backchannel } =
      logoutRequestParams(req);

    // 1. Identify the user — from local session or id_token_hint — and the client, which decides the redirect
    let subject: string | undefined = req.session.user;
    let clientId: string | undefined = client_id;

    // An `id_token_hint` is a signed assertion (RP-Initiated Logout §2: *"ID Token previously issued by the
    // OP"*), so it identifies the End-User only once its signature is verified. This used to call
    // `jwt.decode` and trust `payload.sub`, which let anyone name any subject — and that subject drives the
    // back-channel delivery below. An unverifiable hint now yields no subject at all; it is never an error
    // to the caller, and logout proceeds either way.
    //
    // `aud` is pinned only when the caller supplied `client_id`. §2 makes `client_id` OPTIONAL, so demanding
    // it would refuse conformant requests; a genuine OP-signed token issued to a different client still
    // names the right subject, which is why an unpinned `aud` is logged rather than refused.
    //
    // The hint is verified when it could supply *either* missing piece — the subject or the client. §2 makes
    // `client_id` OPTIONAL precisely because the hint can name the RP, and §3's redirect check needs that
    // identity; a session-authenticated user logging out of an SPA that sends only a hint is the ordinary
    // case. Verification happens at most once either way.
    if (id_token_hint && (!subject || !clientId)) {
      try {
        const { jwks, issuer } = await this.verificationMaterial(req);
        const result = verifyIdTokenHint(id_token_hint, {
          jwks,
          issuer,
          audience: client_id,
        });

        if (result.subject) {
          // The session still wins for delivery: it is this OP's own record of who is signed in here.
          if (!subject) subject = result.subject;
          if (!clientId) clientId = result.audience;
          log.info("Logout: verified id_token_hint", {
            subjectFromHint: !req.session.user,
            clientFromHint: !client_id && !!result.audience,
            audiencePinned: !!client_id,
            hintExpired: !!result.expired,
          });
        } else {
          log.info("Logout: id_token_hint rejected, continuing without a subject", {
            reason: result.reason,
          });
        }
      } catch (err) {
        // Losing the key set or the issuer must not identify anybody, and must not fail the logout.
        log.error("Logout: could not verify id_token_hint", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.info("RP-Initiated Logout", {
      subject,
      hasPostLogoutRedirectUri: !!post_logout_redirect_uri,
      clientId,
      backchannel: !!backchannel,
    });

    // 2. If backchannel=true, fire deliver-all BEFORE session destruction
    //    so we can log the subject while it's still available
    let backchannelResults: unknown = null;
    if (backchannel === "true" && subject) {
      try {
        backchannelResults = await this.backchannelLogoutService.issueAndDeliverToAll(subject);
        log.info("Backchannel logout deliver-all completed", { subject });
      } catch (err) {
        log.error("Backchannel logout deliver-all failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Destroy the local session and clear cookie
    req.session.destroy((err) => {
      if (err) log.error("Failed to destroy session", { err });
    });
    res.clearCookie("connect.sid", { path: "/" });

    // 4. Match post_logout_redirect_uri against the identified client's registered set (§3).
    //    `LOGOUT_REDIRECT_URI` no longer decides anything — it is only the "Return to application" link on
    //    the signed-out page below. `ALLOWED_ORIGINS` keeps its CORS job in `app.ts` and nothing else.
    const allowedRedirectUri = process.env.LOGOUT_REDIRECT_URI || "http://localhost:3000";
    const registered = registeredPostLogoutRedirectUris(clientId);

    if (post_logout_redirect_uri) {
      const isAllowed = isAllowedPostLogoutRedirectUri(post_logout_redirect_uri, registered);

      if (isAllowed) {
        const separator = post_logout_redirect_uri.includes("?") ? "&" : "?";
        const redirectUrl = state
          ? `${post_logout_redirect_uri}${separator}state=${encodeURIComponent(state)}`
          : post_logout_redirect_uri;

        log.info("Logout: redirecting to post_logout_redirect_uri", { redirectUrl });
        return res.redirect(redirectUrl);
      }

      // No client ⇒ no registered set ⇒ no redirect, which is §3's answer rather than a failure. Logged
      // distinctly from "registered, but not this URI" because the two need different fixes.
      log.info("Logout: post_logout_redirect_uri not allowed, rendering page", {
        post_logout_redirect_uri,
        clientId,
        clientIdentified: !!clientId,
        registeredCount: registered.length,
      });
    }

    // 5. No valid redirect — render the signed-out page (a report, not a request for consent)
    return res.render("logout", {
      client_id: clientId || process.env.LOGOUT_CLIENT_ID || "",
      post_logout_redirect_uri: allowedRedirectUri,
      subject: subject || "",
      backchannelResults: backchannelResults ? JSON.stringify(backchannelResults, null, 2) : null,
    });
  }

  /**
   * Render the logout confirmation page. **This is the whole of `GET /api/logout`**: it destroys nothing,
   * delivers nothing, and redirects nowhere. Only the POST above ends a session.
   *
   * **RP-Initiated Logout 1.0 §2:** *"At the Logout Endpoint, the OP SHOULD ask the End-User whether to log
   * out of the OP as well. Furthermore, the OP MUST ask the End-User this question if an `id_token_hint` was
   * not provided or if the supplied ID Token does not belong to the current OP session."*
   *
   * This deployment asks **unconditionally**, which satisfies the SHOULD as well as the MUST. The narrower
   * reading — skip the page when a verified hint names the current session's subject — would leave a GET that
   * still destroys a session, so a captured `id_token_hint` would stay a forced-logout primitive. Asking every
   * time is the only form that closes the CSRF-able GET, and that mattered: logout is state-changing, so
   * before this a bare `<img src="…/api/logout">` on any page the user visited logged them out.
   *
   * The destination is shown to the user only when it would actually be honoured. That is presentational —
   * the security decision stays on the POST, in `isAllowedPostLogoutRedirectUri`, unchanged. Echoing an
   * unvetted attacker-supplied URI onto the page would be a phishing aid rather than an XSS, since EJS
   * escapes it, and there is no reason to offer either.
   *
   * The client is resolved from the `client_id` parameter **only** — a page render does not verify an
   * `id_token_hint`, which would cost two Authlete-backed lookups to decide a line of text. So a request
   * carrying only a hint shows no destination and still redirects correctly on the POST.
   *
   * `csrfToken` is not passed here: `middleware/csrf.ts` puts it on `res.locals`, which Express merges into
   * the render locals. Same arrangement as `device-verification.ejs`.
   */
  async showConfirmation(
    req: Request & { session: Partial<session.SessionData> },
    res: Response
  ) {
    const log = req.logger || logger;
    const params = logoutRequestParams(req);
    const registered = registeredPostLogoutRedirectUris(params.client_id);

    const redirectShown =
      params.post_logout_redirect_uri &&
      isAllowedPostLogoutRedirectUri(params.post_logout_redirect_uri, registered)
        ? params.post_logout_redirect_uri
        : null;

    log.info("Logout: rendering the confirmation page", {
      subject: req.session.user,
      hasPostLogoutRedirectUri: !!params.post_logout_redirect_uri,
      redirectShown: !!redirectShown,
      clientId: params.client_id,
      backchannel: params.backchannel === "true",
    });

    // Every parameter is replayed as a hidden field, so the POST carries exactly what the GET was given.
    return res.render("logout-confirm", {
      ...params,
      subject: req.session.user || "",
      redirectShown,
    });
  }
}

/** The five RP-supplied parameters of a logout request. All are OPTIONAL per RP-Initiated Logout §2. */
export interface LogoutRequestParams {
  id_token_hint?: string;
  post_logout_redirect_uri?: string;
  state?: string;
  client_id?: string;
  backchannel?: string;
}

/**
 * Read the logout parameters from the request body first, then the query string.
 *
 * §2: *"The RP SHOULD use the HTTP GET or POST methods"* — so a form body is a spec-shaped source for a
 * logout request, and it is the one the confirmation page uses. The query string is still read so that a
 * caller who posts `?state=…` alongside `_csrf` gets what they expect.
 *
 * **Merging the two channels widens nothing**, and it is worth being explicit about why, because
 * `introspection.service.ts` and `userinfo.service.ts` follow the opposite rule. Their server-determined
 * fields (`htu`, `targetUri`, the token itself) must never come from a caller, since letting the caller
 * choose them defeats the check being made. Nothing here is in that class: `id_token_hint` is a signed
 * assertion verified on its own merits, and `post_logout_redirect_uri` is tested against the allowlist
 * whichever channel carried it. An empty value is treated as absent, matching the previous `req.query`
 * behaviour where `""` was simply falsy.
 */
function logoutRequestParams(req: Request): LogoutRequestParams {
  const query = (req.query || {}) as Record<string, unknown>;
  const body = (req.body || {}) as Record<string, unknown>;

  const read = (name: string): string | undefined => {
    const value = body[name] ?? query[name];
    return typeof value === "string" && value !== "" ? value : undefined;
  };

  return {
    id_token_hint: read("id_token_hint"),
    post_logout_redirect_uri: read("post_logout_redirect_uri"),
    state: read("state"),
    client_id: read("client_id"),
    backchannel: read("backchannel"),
  };
}
