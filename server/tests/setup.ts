import dotenv from "dotenv"
import path from "path"

dotenv.config({ path: path.resolve(__dirname, "..", ".env") })

// Tests never talk to a real Redis, and until 2026-08-20 they did whenever a developer had one configured.
//
// `server/.env` carries `REDIS_URL`, and this file loads it — so locally `middleware/session.ts` built a
// connect-redis store while CI (which has no `.env`) built a MemoryStore. Two different session stores for the
// same suite, decided by whether the machine happened to have Redis set up. CI is the reference, so make every
// run match it.
//
// It also removes a real listener leak: `express-session` attaches `connect` and `disconnect` listeners to the
// store on every `session()` call (`express-session/index.js:178,181`), the store is a module-level singleton,
// and `createApp()` is called dozens of times per file — which is what produced
// `MaxListenersExceededWarning: 11 disconnect listeners added to [RedisStore]` on every local run.
//
// The connect-redis code path is covered by `tests/unit/utils/session-store.test.ts` with a fake, and by the
// hand-captured transcript recorded there. Nothing here needs the real thing.
//
// Assign "" rather than `delete` — `config/app.config.ts` calls `dotenv.config()` when it is imported, and
// dotenv only skips a key that is already present. Deleting it hands the value straight back on the next
// import; an empty string is present, so it survives, and `session.ts` treats it as falsy. Same technique, and
// the same reason, as Module 11's lab uses to defeat `MGMT_CLIENT_*` on a second server instance.
process.env.REDIS_URL = ""

if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "test-secret"
}
if (!process.env.AUTHLETE_BEARER_TOKEN) {
  process.env.AUTHLETE_BEARER_TOKEN = "test-bearer-token"
}
if (!process.env.AUTHLETE_BASE_URL) {
  process.env.AUTHLETE_BASE_URL = "https://eu.authlete.com"
}
if (!process.env.AUTHLETE_SERVICE_ID) {
  process.env.AUTHLETE_SERVICE_ID = "test-service-id"
}
