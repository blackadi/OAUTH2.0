#!/usr/bin/env node
/**
 * Generate the client's Authlete result-code table from the vendored Authlete OpenAPI document.
 *
 * **Why generated rather than written.** The client needs to turn `[A157357]` into an explanation, and
 * the one thing that must not happen in a teaching tool is an invented explanation for a vendor code.
 * `docs/openapi-spec.json` is Authlete's own document (3.0.16) and states, per response, the
 * `resultCode`, its `resultMessage`, the HTTP status it arrives with, and the endpoint that produced
 * it. Extracting those four facts mechanically means every entry in the generated file is traceable to
 * a line in the vendor's specification, and re-running this after an SDK or spec bump shows what moved.
 *
 * Anything the vendor does not document here gets no entry, and the decoder says so rather than
 * guessing. The repo's own live-verified findings are layered on top by hand in
 * `client/src/data/errorDocs.ts`, where they are labelled as such.
 *
 * Usage: node scripts/extract-authlete-codes.mjs [--check]
 *   --check  fail instead of writing, if the generated file is out of date
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..");
const SPEC_PATH = join(REPO_ROOT, "docs", "openapi-spec.json");
const OUT_PATH = join(REPO_ROOT, "client", "src", "data", "authlete-codes.generated.ts");

const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
const specVersion = spec.info?.version ?? "unknown";

/** code -> { message, status, endpoints:Set } */
const codes = new Map();

function record(code, message, status, endpoint) {
  if (!/^A\d{6}$/.test(code)) return;
  const existing = codes.get(code);
  if (existing) {
    existing.endpoints.add(endpoint);
    return;
  }
  codes.set(code, {
    // The message is prefixed with its own code in the vendor text; drop the redundancy.
    message: String(message ?? "").replace(/^\[A\d{6}\]\s*/, "").trim(),
    status: Number(status),
    endpoints: new Set([endpoint]),
  });
}

for (const [path, methods] of Object.entries(spec.paths ?? {})) {
  for (const [method, operation] of Object.entries(methods)) {
    if (typeof operation !== "object" || !operation?.responses) continue;
    for (const [status, response] of Object.entries(operation.responses)) {
      const example = response?.content?.["application/json"]?.example;
      if (!example?.resultCode) continue;
      record(example.resultCode, example.resultMessage, status, `${method.toUpperCase()} ${path}`);
    }
  }
}

const sorted = [...codes.entries()].sort(([a], [b]) => a.localeCompare(b));

const body = sorted
  .map(([code, info]) => {
    const endpoints = [...info.endpoints].sort();
    const message = JSON.stringify(info.message);
    // Four codes (TLS required, missing Authorization header, locked client, server error) appear as
    // boilerplate examples on *every* operation. Naming one of them — whichever sorts first — would
    // attribute a `/auth/authorization` message to `DELETE /auth/token/delete`, which is simply false.
    // Above the threshold the honest answer is "many", and the decoder says so.
    const generic = endpoints.length > 3;
    const endpoint = generic ? "null" : JSON.stringify(endpoints[0]);
    return `  ${code}: { message: ${message}, status: ${info.status}, endpoint: ${endpoint}${
      generic ? `, endpointCount: ${endpoints.length}` : ""
    } },`;
  })
  .join("\n");

const file = `/**
 * Authlete result codes, extracted from the vendored Authlete OpenAPI document.
 *
 * **Generated — do not edit.** Run \`node scripts/extract-authlete-codes.mjs\` to regenerate.
 * Source: \`docs/openapi-spec.json\` (Authlete ${specVersion}).
 *
 * Every entry here is the vendor's own \`resultMessage\` for that \`resultCode\`, with the HTTP status
 * and the endpoint the document attaches it to. Nothing is paraphrased and nothing is inferred: a code
 * the vendor does not document simply has no entry, and the decoder reports it as unrecognised rather
 * than inventing a cause. Repo-verified guidance is layered on top by hand in \`errorDocs.ts\`.
 *
 * ${sorted.length} codes.
 */

export interface AuthleteCode {
  /** The vendor's own message, with its redundant \`[Annnnnn]\` prefix removed. */
  message: string;
  /** The HTTP status the vendor document attaches to it. */
  status: number;
  /**
   * The Authlete API that produces it, or \`null\` when the document attaches the code to many
   * operations as boilerplate — in which case \`endpointCount\` says how many.
   */
  endpoint: string | null;
  endpointCount?: number;
}

export const AUTHLETE_CODES: Record<string, AuthleteCode> = {
${body}
};

export const AUTHLETE_SPEC_VERSION = ${JSON.stringify(specVersion)};
`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT_PATH, "utf8");
  } catch {
    console.error(`✗ ${OUT_PATH} does not exist. Run: node scripts/extract-authlete-codes.mjs`);
    process.exit(1);
  }
  if (current !== file) {
    console.error("✗ authlete-codes.generated.ts is out of date with docs/openapi-spec.json.");
    console.error("  Run: node scripts/extract-authlete-codes.mjs");
    process.exit(1);
  }
  console.log(`✓ authlete-codes.generated.ts matches the spec (${sorted.length} codes)`);
  process.exit(0);
}

writeFileSync(OUT_PATH, file);
console.log(`✓ wrote ${sorted.length} codes from Authlete ${specVersion} to`);
console.log(`  ${OUT_PATH.replace(REPO_ROOT + "/", "")}`);
