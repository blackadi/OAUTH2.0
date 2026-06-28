import "dotenv/config"
import { Authlete } from "@authlete/typescript-sdk"

const serviceId = process.env.AUTHLETE_SERVICE_ID || "2196157042"
const api = new Authlete({
  bearer: process.env.AUTHLETE_BEARER_TOKEN || "",
  serverURL: process.env.AUTHLETE_BASE_URL || "https://api.authlete.com",
})

const STANDARD_SCOPES = [
  { name: "openid", description: "OpenID Connect authentication" },
  { name: "profile", description: "Access to profile information" },
  { name: "email", description: "Access to email address" },
  { name: "address", description: "Access to physical address" },
  { name: "phone", description: "Access to phone number" },
  { name: "offline_access", description: "Access to refresh tokens" },
  { name: "scope1", description: "Scope 1" },
  { name: "scope2", description: "Scope 2" },
]

async function main() {
  // Get current service
  const svc = (await api.service.get({ serviceId })) as any
  const currentScopes: any[] = svc.supportedScopes || []

  // Merge existing + new, avoiding duplicates
  const existingNames = new Set(currentScopes.map((s: any) => s.name))
  const mergedScopes = [...currentScopes]
  for (const scope of STANDARD_SCOPES) {
    if (!existingNames.has(scope.name)) {
      mergedScopes.push(scope)
    }
  }

  // Also fix refreshTokenDuration (currently 0) and accessTokenDuration (currently 0)
  const hadRtDurationZero = svc.refreshTokenDuration === 0
  const hadAtDurationZero = svc.accessTokenDuration === 0

  console.log(`Supported scopes: ${mergedScopes.length} (was ${currentScopes.length})`)
  console.log(`refreshTokenDuration: ${svc.refreshTokenDuration} → ${hadRtDurationZero ? 86400 : svc.refreshTokenDuration}`)
  console.log(`accessTokenDuration: ${svc.accessTokenDuration} → ${hadAtDurationZero ? 3600 : svc.accessTokenDuration}`)

  // Update service
  const updated = await api.service.update({
    serviceId,
    service: {
      ...svc,
      supportedScopes: mergedScopes,
      refreshTokenDuration: hadRtDurationZero ? 86400 : svc.refreshTokenDuration,
      accessTokenDuration: hadAtDurationZero ? 3600 : svc.accessTokenDuration,
    } as any,
  })

  console.log("Update successful!")
  const updatedSvc = updated as any
  console.log("Scopes:", JSON.stringify(updatedSvc.supportedScopes?.map((s: any) => s.name)))
  console.log("refreshTokenDuration:", updatedSvc.refreshTokenDuration)
  console.log("accessTokenDuration:", updatedSvc.accessTokenDuration)

  // Verify by re-fetching
  const verify = (await api.service.get({ serviceId })) as any
  console.log("Verified scopes:", JSON.stringify(verify.supportedScopes?.map((s: any) => s.name)))
  console.log("Verified refreshTokenDuration:", verify.refreshTokenDuration)
  console.log("Verified accessTokenDuration:", verify.accessTokenDuration)
}

main().catch((err) => {
  console.error("Failed:", err.message)
  if ((err as any).body) console.error("Body:", (err as any).body)
  process.exit(1)
})
