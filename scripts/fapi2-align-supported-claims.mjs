#!/usr/bin/env node
/**
 * Align the Authlete service's `supportedClaims` with the claims this server can actually serve.
 *
 *   node scripts/fapi2-align-supported-claims.mjs            # dry run — prints the diff
 *   node scripts/fapi2-align-supported-claims.mjs --apply    # writes it
 *
 * **Why this exists.** The service advertised 20 claims in `claims_supported` while the server could
 * produce 11. Nothing connected the two, so the gap survived every gate in this repo and was found by
 * a conformance run:
 *
 *   WARNING  EnsureIdentityClaimsContainRequestedClaims: The server did not return all the requested
 *            claims. … As the server listed the claims in claims_supported, it should have returned
 *            them in either the id_token or the userinfo response.
 *
 * Omitting a claim you have no value for is correct (OIDC Core §5.1); advertising it is not. The nine
 * dropped — address, birthdate, gender, middle_name, phone_number, phone_number_verified, picture,
 * profile, website — were served by nothing.
 *
 * **Scripted rather than clicked.** The Authlete console leaves no trace in the repo, and
 * `AGENTS.md` is explicit that a configuration change has no error string and no gate catches it. This
 * is reviewable, re-runnable, and names its source of truth.
 *
 * The source of truth is `SERVED_CLAIMS` in `server/src/utils/demo-claims.ts`, read from the TypeScript
 * source rather than imported — this is a plain `.mjs` script like its siblings, and a build step to
 * read one array would be worse than a parse.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(repoRoot, "server");
const requireFromServer = createRequire(join(serverDir, "package.json"));
const { Authlete } = requireFromServer("@authlete/typescript-sdk");
const { config: loadEnv } = requireFromServer("dotenv");
loadEnv({ path: join(serverDir, ".env") });

const APPLY = process.argv.slice(2).includes("--apply");

/** Read `SERVED_CLAIMS` out of the TypeScript source. Throws rather than guessing if the shape moves. */
export function servedClaims(source) {
  const block = source.match(/export const SERVED_CLAIMS = \[([\s\S]*?)\] as const;/);
  if (!block) {
    throw new Error(
      "could not find `export const SERVED_CLAIMS = [...] as const;` in demo-claims.ts — " +
        "if it was renamed or reshaped, update this script and check-claims-supported.mjs together",
    );
  }
  const names = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!names.length) throw new Error("SERVED_CLAIMS parsed as empty — refusing to wipe supportedClaims");
  return names;
}

const SOURCE = join(serverDir, "src", "utils", "demo-claims.ts");
const wanted = servedClaims(readFileSync(SOURCE, "utf8"));

const { AUTHLETE_BEARER_TOKEN, AUTHLETE_BASE_URL, AUTHLETE_SERVICE_ID } = process.env;
for (const [k, v] of Object.entries({ AUTHLETE_BEARER_TOKEN, AUTHLETE_BASE_URL, AUTHLETE_SERVICE_ID })) {
  if (!v) {
    console.error(`missing ${k} in server/.env`);
    process.exit(2);
  }
}

const api = new Authlete({ bearer: AUTHLETE_BEARER_TOKEN, serverURL: AUTHLETE_BASE_URL });
const service = await api.service.get({ serviceId: AUTHLETE_SERVICE_ID });
const current = service.supportedClaims ?? [];

const toRemove = current.filter((c) => !wanted.includes(c));
const toAdd = wanted.filter((c) => !current.includes(c));

console.log(`service  : ${service.serviceName} (${AUTHLETE_SERVICE_ID}) on ${AUTHLETE_BASE_URL}`);
console.log(`mode     : ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log(`currently advertised : ${current.length}`);
console.log(`servable by this code: ${wanted.length}\n`);

if (toRemove.length) {
  console.log(`advertised but NOT servable — will be REMOVED (${toRemove.length}):`);
  for (const c of toRemove.sort()) console.log(`  - ${c}`);
}
if (toAdd.length) {
  // The other direction, and the more surprising one: the code can serve a claim nobody is told about,
  // so no client would ever request it.
  console.log(`\nservable but NOT advertised — will be ADDED (${toAdd.length}):`);
  for (const c of toAdd.sort()) console.log(`  + ${c}`);
}
if (!toRemove.length && !toAdd.length) {
  console.log("✅ already aligned — nothing to do.");
  process.exit(0);
}

if (!APPLY) {
  console.log("\nDry run — nothing written. Re-run with --apply.");
  process.exit(0);
}

/**
 * `service.update` replaces the whole object, so send the service back with only this field changed.
 * Reading it fresh above and spreading it here is what keeps every other setting — `fapiModes`,
 * `pkceRequired`, the endpoints — exactly as it was.
 */
await api.service.update({
  serviceId: AUTHLETE_SERVICE_ID,
  service: { ...service, supportedClaims: wanted },
});

const after = (await api.service.get({ serviceId: AUTHLETE_SERVICE_ID })).supportedClaims ?? [];
console.log(`\nwrote supportedClaims: ${after.length} claims`);
console.log(`  ${after.slice().sort().join(", ")}`);

const stillWrong = after.filter((c) => !wanted.includes(c)).concat(wanted.filter((c) => !after.includes(c)));
if (stillWrong.length) {
  console.error(`\n✗ read-back disagrees on: ${stillWrong.join(", ")}`);
  process.exit(1);
}
console.log("\n✅ read-back matches. Re-run `node scripts/check-claims-supported.mjs` against the live");
console.log("   discovery document once the deployment has picked it up.");
