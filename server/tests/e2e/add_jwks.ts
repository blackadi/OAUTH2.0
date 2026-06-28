import "dotenv/config"
import { Authlete } from "@authlete/typescript-sdk"
import { generateKeyPairSync, createPublicKey, createPrivateKey } from "node:crypto"

const serviceId = process.env.AUTHLETE_SERVICE_ID || "2196157042"
const api = new Authlete({
  bearer: process.env.AUTHLETE_BEARER_TOKEN || "",
  serverURL: process.env.AUTHLETE_BASE_URL || "https://api.authlete.com",
})

async function main() {
  // Get current service
  const svc = (await api.service.get({ serviceId })) as any

  // Generate EC P-256 key pair as JWK
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  })

  const pubJwk = createPublicKey(publicKey).export({ format: "jwk" }) as any
  const privJwk = createPrivateKey(privateKey).export({ format: "jwk" }) as any

  pubJwk.use = "sig"
  pubJwk.kid = "default-key-001"
  pubJwk.alg = "ES256"
  privJwk.use = "sig"
  privJwk.kid = "default-key-001"
  privJwk.alg = "ES256"

  const jwks = JSON.stringify({ keys: [pubJwk, privJwk] })

  // Update service with JWK Set
  const updated = await api.service.update({
    serviceId,
    service: {
      ...svc,
      jwks,
      idTokenSignatureKeyId: "default-key-001",
    } as any,
  })

  console.log("JWK Set registered successfully!")
  console.log("idTokenSignatureKeyId:", (updated as any).idTokenSignatureKeyId)

  // Verify
  const verify = (await api.service.get({ serviceId })) as any
  console.log("Verified idTokenSignatureKeyId:", verify.idTokenSignatureKeyId)
  console.log("Verified jwks length:", verify.jwks?.length)
}

main().catch((err) => {
  console.error("Failed:", err.message)
  if ((err as any).body) console.error("Body:", (err as any).body)
  process.exit(1)
})
