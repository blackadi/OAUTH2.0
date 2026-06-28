import "dotenv/config"
import { Authlete } from "@authlete/typescript-sdk"

const serviceId = process.env.AUTHLETE_SERVICE_ID || "2196157042"
const api = new Authlete({
  bearer: process.env.AUTHLETE_BEARER_TOKEN || "",
  serverURL: process.env.AUTHLETE_BASE_URL || "https://api.authlete.com",
})

async function main() {
  // 1. Get full service configuration
  try {
    const svc = await api.service.get({ serviceId })
    const s: any = svc
    console.log("=== Service Details ===")
    console.log("serviceName:", s.serviceName)
    console.log("supportedScopes:", s.supportedScopes?.map((x: any) => x.name).join(", "))
    console.log("refreshTokenDuration:", s.refreshTokenDuration)
    console.log("refreshTokenDurationKept:", s.refreshTokenDurationKept)
    console.log("refreshTokenDurationReset:", s.refreshTokenDurationReset)
    console.log("accessTokenDuration:", s.accessTokenDuration)
    console.log("idTokenSignatureKeyId:", s.idTokenSignatureKeyId)
    console.log("issuer:", s.issuer)
    console.log("userInfoSignAlg:", s.userInfoSignAlg)
    console.log("userInfoEncryptionAlg:", s.userInfoEncryptionAlg)
    console.log("userinfoEndpoint:", s.userinfoEndpoint)
    console.log("supportedClientRegistrationTypes:", s.supportedClientRegistrationTypes)
    console.log("dcrScopeUsedAsRequestable:", s.dcrScopeUsedAsRequestable)
    console.log("dcrDuplicateSoftwareIdBlocked:", s.dcrDuplicateSoftwareIdBlocked)
    console.log("registrationEndpoint:", s.registrationEndpoint)
    console.log("supportedGrantTypes:", s.supportedGrantTypes)
    console.log("backchannelAuthenticationEndpoint:", s.backchannelAuthenticationEndpoint)
    console.log("supportedBackchannelTokenDeliveryModes:", s.supportedBackchannelTokenDeliveryModes)
    console.log("backchannelAuthReqIdDuration:", s.backchannelAuthReqIdDuration)
    console.log("backchannelPollingInterval:", s.backchannelPollingInterval)
    console.log("deviceAuthorizationEndpoint:", s.deviceAuthorizationEndpoint)
    console.log("deviceFlowCodeDuration:", s.deviceFlowCodeDuration)
    console.log("deviceFlowPollingInterval:", s.deviceFlowPollingInterval)
    const rawConfig = await api.service.getConfiguration({ serviceId })
    console.log("Configuration response keys:", Object.keys(rawConfig as any).sort().join(", "))
  } catch (err) {
    console.log("Error getting service details:", (err as Error).message)
    if ((err as any).body) console.log("Body:", (err as any).body)
  }

  // 2. Test authorization with scope=openid
  for (const scope of ["openid", "scope1", "scope2", "profile"]) {
    try {
      const result = await api.authorization.processRequest({
        serviceId,
        authorizationRequest: {
          parameters: `response_type=code&client_id=${process.env.CID || ""}&redirect_uri=http://localhost:3000&scope=${scope}&state=test123`,
        },
      })
      console.log(`\n=== Authorization with scope=${scope} ===`)
      console.log("action:", result.action)
      if (result.scopes && result.scopes.length > 0) {
        console.log("scopes:", result.scopes.map((s: any) => s.name).join(", "))
      } else {
        console.log("scopes: EMPTY")
      }
    } catch (err) {
      console.log(`Error with scope=${scope}:`, (err as Error).message)
    }
  }
}

main()
