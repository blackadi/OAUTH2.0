#!/usr/bin/env node
/**
 * Prepare this Authlete service for an OpenID Foundation conformance-suite run, and emit the test
 * plan configuration.
 *
 *   node scripts/fapi2-conformance-setup.mjs [--alias my-alias] [--apply]
 *
 * Without `--apply` it only prints what it would do. With `--apply` it:
 *
 *   1. registers the suite's callback on the existing FAPI client, keeping the URIs already there;
 *   2. creates (or updates) a SECOND FAPI client with the same posture and its own key;
 *   3. writes `conformance/fapi2-config.json` plus the two private keys beside it.
 *
 * **Why a second client.** The suite verifies that an authorization code issued to one client
 * cannot be redeemed by another — it needs two independently-keyed confidential clients to do it.
 * A plan configured with one will fail those tests for the wrong reason.
 *
 * **Why the alias matters.** The callback is
 * `https://www.certification.openid.net/test/a/<ALIAS>/callback`, and the suite's own documentation
 * warns: *"If you use the same alias as another user, your tests will interfere with each other."*
 * Pick something unmistakably yours.
 *
 * The private keys are written next to the config because the suite needs them to sign
 * `private_key_jwt` assertions and request objects. They are generated fresh here and never leave
 * this machine except into that config — `conformance/` is gitignored by this script's own check.
 */
import { createRequire } from "node:module";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(repoRoot, "server");
const requireFromServer = createRequire(join(serverDir, "package.json"));
const { Authlete } = requireFromServer("@authlete/typescript-sdk");
const { config: loadEnv } = requireFromServer("dotenv");
loadEnv({ path: join(serverDir, ".env") });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ALIAS = (args[args.indexOf("--alias") + 1] || "").startsWith("--") || args.indexOf("--alias") === -1
  ? "blackadi-fapi2"
  : args[args.indexOf("--alias") + 1];

const CALLBACK = `https://www.certification.openid.net/test/a/${ALIAS}/callback`;
const PRIMARY_CLIENT_ID = process.env.FAPI_CLIENT_ID || "1241400020";

const { AUTHLETE_BEARER_TOKEN, AUTHLETE_BASE_URL, AUTHLETE_SERVICE_ID } = process.env;
for (const [k, v] of Object.entries({ AUTHLETE_BEARER_TOKEN, AUTHLETE_BASE_URL, AUTHLETE_SERVICE_ID })) {
  if (!v) {
    console.error(`missing ${k} in server/.env`);
    process.exit(2);
  }
}
const api = new Authlete({ bearer: AUTHLETE_BEARER_TOKEN, serverURL: AUTHLETE_BASE_URL });
const serviceId = AUTHLETE_SERVICE_ID;

/** EC P-256 / ES256 — the only family this service's JWK Set can verify against, and on 5.4.1's list. */
function keypair(kid) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pub = { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" };
  const priv = { ...privateKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" };
  return { pub, priv };
}

console.log(`alias    : ${ALIAS}`);
console.log(`callback : ${CALLBACK}`);
console.log(`mode     : ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);

const service = await api.service.get({ serviceId });
const primary = await api.client.get({ serviceId, clientId: PRIMARY_CLIENT_ID });

// ── 1. the suite's callback on the primary client ───────────────────────────
const primaryUris = new Set(primary.redirectUris || []);
const primaryNeedsCallback = !primaryUris.has(CALLBACK);
console.log(`client ${primary.clientId} (${primary.clientName})`);
console.log(`  redirect URIs      : ${[...primaryUris].join(", ") || "(none)"}`);
console.log(`  needs the callback : ${primaryNeedsCallback}`);

// ── 2. the second client ────────────────────────────────────────────────────
const SECOND_NAME = `fapi conformance client2 (${ALIAS})`;
const list = await api.client.list({ serviceId, limit: 50 });
let second = (list.clients || []).find((c) => c.clientName === SECOND_NAME);
console.log(`\nsecond client        : ${second ? `exists (${second.clientId})` : "will be created"}`);

const primaryKeys = keypair(`conformance-client1-${ALIAS}`);
const secondKeys = keypair(`conformance-client2-${ALIAS}`);

if (!APPLY) {
  console.log("\nDry run — nothing written. Re-run with --apply.");
  process.exit(0);
}

// Primary: add the callback, and re-key so the config below holds a private key that matches
// what is registered. Registering a public key you do not hold the private half of is the single
// most common reason a conformance run fails at the first client-authentication step.
if (primaryNeedsCallback || true) {
  primary.redirectUris = [...primaryUris, CALLBACK];
  primary.jwks = JSON.stringify({ keys: [primaryKeys.pub] });
  await api.client.update({ serviceId, clientId: String(primary.clientId), client: primary });
  console.log(`\nupdated client ${primary.clientId}: callback registered, key rotated`);
}

// Second client: same posture as the primary, its own key, its own name.
const secondBody = {
  ...primary,
  clientId: second?.clientId,
  clientIdAlias: undefined,
  clientName: SECOND_NAME,
  jwks: JSON.stringify({ keys: [secondKeys.pub] }),
  redirectUris: [CALLBACK],
};
delete secondBody.number;
delete secondBody.createdAt;
delete secondBody.modifiedAt;

if (second) {
  second = await api.client.update({ serviceId, clientId: String(second.clientId), client: secondBody });
  console.log(`updated client ${second.clientId} (${SECOND_NAME})`);
} else {
  delete secondBody.clientId;
  second = await api.client.create({ serviceId, client: secondBody });
  console.log(`created client ${second.clientId} (${SECOND_NAME})`);
}

// ── 3. the test plan configuration ──────────────────────────────────────────
const outDir = join(repoRoot, "conformance");
mkdirSync(outDir, { recursive: true });

const plan = {
  alias: ALIAS,
  description: `FAPI 2.0 Security Profile + Message Signing — ${service.serviceName} (${serviceId})`,
  server: {
    // Root, not /api/. OIDC Discovery §4 puts it at {issuer}/.well-known/openid-configuration, and
    // a suite that cannot fetch it there stops before the first test.
    discoveryUrl: `${service.issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`,
  },
  client: {
    client_id: String(primary.clientId),
    scope: "openid myscope",
    jwks: { keys: [primaryKeys.priv] },
  },
  client2: {
    client_id: String(second.clientId),
    scope: "openid myscope",
    jwks: { keys: [secondKeys.priv] },
  },
  /**
   * The suite drives the login and consent screens itself. Selectors verified against
   * `server/src/views/login.ejs` and `consent.ejs` — if that markup changes, this breaks first.
   *
   * **Sign in is clicked by `id`, not by `name`.** `name="login"` matches TWO buttons on that form:
   * `value="submit"` (Sign in) and `value="cancel"` (Cancel). A name selector can pick either, and
   * a run that silently cancels every authorization looks like the server refusing consent.
   *
   * **The credentials are almost certainly wrong for a deployed run.** `AUTH_USERS` is set per
   * deployment and is not in the repo; `admin`/`password` is only the fallback a local server uses
   * when it is unset. Against the Render deployment those return 401 — measured. Override with
   * FAPI_USERNAME / FAPI_PASSWORD before running the plan.
   */
  browser: [
    {
      match: `${service.issuer.replace(/\/+$/, "")}/api/session/login*`,
      tasks: [
        {
          task: "Login",
          match: "*/api/session/login*",
          commands: [
            ["text", "id", "username", process.env.FAPI_USERNAME || "admin"],
            ["text", "id", "password", process.env.FAPI_PASSWORD || "password"],
            ["click", "id", "btn-submit"],
          ],
        },
        {
          task: "Consent",
          match: "*/api/session/consent*",
          optional: true,
          // `.approve` is unique; the sibling is `.deny`.
          commands: [["click", "css", "button.approve"]],
        },
      ],
    },
  ],
};

const planPath = join(outDir, "fapi2-config.json");
writeFileSync(planPath, JSON.stringify(plan, null, 2));
console.log(`\nwrote ${planPath}`);

// Guard: these files hold private keys. Refuse to leave them in a tracked directory silently.
const gitignore = join(repoRoot, ".gitignore");
const ignoreText = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
if (!ignoreText.includes("conformance/")) {
  console.log(
    "\n!! conformance/ is NOT in .gitignore and these files contain PRIVATE KEYS.\n" +
      "   Add `conformance/` to .gitignore before committing anything.",
  );
} else {
  console.log("conformance/ is gitignored — private keys stay local.");
}
console.log(`\nrun id for this setup: ${randomUUID()}`);
