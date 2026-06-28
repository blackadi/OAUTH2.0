import "dotenv/config"
import { Authlete } from "@authlete/typescript-sdk"

const serviceId = process.env.AUTHLETE_SERVICE_ID || "2196157042"
const api = new Authlete({
  bearer: process.env.AUTHLETE_BEARER_TOKEN || "",
  serverURL: process.env.AUTHLETE_BASE_URL || "https://api.authlete.com",
})

async function main() {
  const svc = (await api.service.get({ serviceId })) as any
  const baseUrl = process.env.BASE_URL || "http://localhost:3000"

  console.log("Before:")
  console.log("  backchannelAuthenticationEndpoint:", svc.backchannelAuthenticationEndpoint)
  console.log("  supportedBackchannelTokenDeliveryModes:", svc.supportedBackchannelTokenDeliveryModes)
  console.log("  backchannelAuthReqIdDuration:", svc.backchannelAuthReqIdDuration)
  console.log("  backchannelPollingInterval:", svc.backchannelPollingInterval)

  const updated = await api.service.update({
    serviceId,
    service: {
      ...svc,
      backchannelAuthenticationEndpoint: `${baseUrl}/api/ciba/authentication`,
      supportedBackchannelTokenDeliveryModes: ["POLL"],
      backchannelAuthReqIdDuration: 600,
      backchannelPollingInterval: 5,
    } as any,
  })

  const u = updated as any
  console.log("\nAfter:")
  console.log("  backchannelAuthenticationEndpoint:", u.backchannelAuthenticationEndpoint)
  console.log("  supportedBackchannelTokenDeliveryModes:", u.supportedBackchannelTokenDeliveryModes)
  console.log("  backchannelAuthReqIdDuration:", u.backchannelAuthReqIdDuration)
  console.log("  backchannelPollingInterval:", u.backchannelPollingInterval)

  const verify = (await api.service.get({ serviceId })) as any
  console.log("\nVerified:")
  console.log("  backchannelAuthenticationEndpoint:", verify.backchannelAuthenticationEndpoint)
  console.log("  supportedBackchannelTokenDeliveryModes:", verify.supportedBackchannelTokenDeliveryModes)
  console.log("  backchannelAuthReqIdDuration:", verify.backchannelAuthReqIdDuration)
  console.log("  backchannelPollingInterval:", verify.backchannelPollingInterval)
}

main().catch((err) => {
  console.error("Failed:", err.message)
  if ((err as any).body) console.error("Body:", (err as any).body)
  process.exit(1)
})
