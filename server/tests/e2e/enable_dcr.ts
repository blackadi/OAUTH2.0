import "dotenv/config"
import { Authlete } from "@authlete/typescript-sdk"

const serviceId = process.env.AUTHLETE_SERVICE_ID || "2196157042"
const api = new Authlete({
  bearer: process.env.AUTHLETE_BEARER_TOKEN || "",
  serverURL: process.env.AUTHLETE_BASE_URL || "https://api.authlete.com",
})

async function main() {
  const svc = (await api.service.get({ serviceId })) as any

  const before = {
    supportedClientRegistrationTypes: svc.supportedClientRegistrationTypes,
    registrationEndpoint: svc.registrationEndpoint,
    dcrScopeUsedAsRequestable: svc.dcrScopeUsedAsRequestable,
    dcrDuplicateSoftwareIdBlocked: svc.dcrDuplicateSoftwareIdBlocked,
  }
  console.log("Before:", JSON.stringify(before, null, 2))

  // Try enabling DCR
  const updated = await api.service.update({
    serviceId,
    service: {
      ...svc,
      supportedClientRegistrationTypes: ["AUTOMATIC"],
      registrationEndpoint: "https://authlete-node-authz-server.onrender.com/api/client/dcr/register",
      dcrScopeUsedAsRequestable: true,
    } as any,
  })

  const u = updated as any
  console.log("After:")
  console.log("  supportedClientRegistrationTypes:", u.supportedClientRegistrationTypes)
  console.log("  registrationEndpoint:", u.registrationEndpoint)
  console.log("  dcrScopeUsedAsRequestable:", u.dcrScopeUsedAsRequestable)

  // Verify
  const verify = (await api.service.get({ serviceId })) as any
  console.log("\nVerified:")
  console.log("  supportedClientRegistrationTypes:", verify.supportedClientRegistrationTypes)
  console.log("  registrationEndpoint:", verify.registrationEndpoint)
  console.log("  dcrScopeUsedAsRequestable:", verify.dcrScopeUsedAsRequestable)
}

main().catch((err) => {
  console.error("Failed:", err.message)
  if ((err as any).body) console.error("Body:", (err as any).body)
  process.exit(1)
})
