import dotenv from "dotenv"
import path from "path"

dotenv.config({ path: path.resolve(__dirname, "..", ".env") })

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
