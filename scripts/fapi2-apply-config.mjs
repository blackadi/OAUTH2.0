#!/usr/bin/env node
/**
 * Apply a FAPI 2.0 service and/or client configuration to Authlete.
 *
 * Takes whole objects, not patches: Authlete's /service/update and /client/update REPLACE the
 * stored record, so the safe shape is fetch -> modify -> send back. Feeding this a partial
 * object silently drops every setting the object omits.
 *
 *   node scripts/fapi2-apply-config.mjs [service.json] [client.json]
 *
 * Pass "" to skip a slot: `node scripts/fapi2-apply-config.mjs "" client.json`.
 *
 * Credentials come from server/.env (AUTHLETE_BEARER_TOKEN, AUTHLETE_BASE_URL,
 * AUTHLETE_SERVICE_ID) and are never echoed. AGENTS.md requires the SDK client rather than a
 * raw fetch(), which is why this loads the SDK out of server/node_modules.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(repoRoot, "server");

// Resolve the SDK and dotenv from server/node_modules — this script lives at the repo root,
// where neither is installed.
const requireFromServer = createRequire(join(serverDir, "package.json"));
const { Authlete } = requireFromServer("@authlete/typescript-sdk");
const { config: loadEnv } = requireFromServer("dotenv");

loadEnv({ path: join(serverDir, ".env") });

const { AUTHLETE_BEARER_TOKEN, AUTHLETE_BASE_URL, AUTHLETE_SERVICE_ID } = process.env;
for (const [k, v] of Object.entries({ AUTHLETE_BEARER_TOKEN, AUTHLETE_BASE_URL, AUTHLETE_SERVICE_ID })) {
  if (!v) {
    console.error(`missing ${k} in server/.env`);
    process.exit(2);
  }
}

const api = new Authlete({ bearer: AUTHLETE_BEARER_TOKEN, serverURL: AUTHLETE_BASE_URL });
const serviceId = AUTHLETE_SERVICE_ID;
const [servicePath, clientPath] = process.argv.slice(2);

const show = (label, pairs) => {
  console.log(label);
  for (const [k, v] of pairs) console.log(`  ${k.padEnd(26)}: ${JSON.stringify(v)}`);
};

if (servicePath) {
  const service = JSON.parse(readFileSync(servicePath, "utf8"));
  const r = await api.service.update({ serviceId, service });
  show("service.update OK", [
    ["issuer", r.issuer],
    ["fapiModes", r.fapiModes],
    ["parRequired", r.parRequired],
    ["pkceRequired", r.pkceRequired],
    ["pkceS256Required", r.pkceS256Required],
    ["authorizationCodeDuration", r.authorizationCodeDuration],
    ["jwks key count", JSON.parse(r.jwks).keys.length],
  ]);
}

if (clientPath) {
  const client = JSON.parse(readFileSync(clientPath, "utf8"));
  const r = await api.client.update({ serviceId, clientId: String(client.clientId), client });
  const jwks = r.jwks ? JSON.parse(r.jwks) : { keys: [] };
  show("client.update OK", [
    ["clientId", r.clientId],
    ["tokenAuthMethod", r.tokenAuthMethod],
    ["tokenAuthSignAlg", r.tokenAuthSignAlg],
    ["idTokenSignAlg", r.idTokenSignAlg],
    ["idTokenEncryptionAlg", r.idTokenEncryptionAlg ?? null],
    ["dpopRequired", r.dpopRequired],
    ["parRequired", r.parRequired],
    ["pkceS256Required", r.pkceS256Required],
    ["requestObjectRequired", r.requestObjectRequired],
    ["jwks", jwks.keys.map((k) => `${k.kid}(private=${"d" in k})`)],
  ]);
}
