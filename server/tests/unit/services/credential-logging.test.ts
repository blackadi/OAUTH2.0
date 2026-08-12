import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { TokenService } from "../../../src/services/token.service"
import { RevocationService } from "../../../src/services/revocation.service"
import { Authlete } from "@authlete/typescript-sdk"
import type { CallableLogger } from "../../../src/utils/logger"

// RFC 9700 §4.2.4 — 9700-W1 / 9700-W2.
//
// token.service.ts and revocation.service.ts used to log `body: parameters` — the raw request body,
// preferentially req.rawBody — at info level, which is the level of the 14-day rotating file transport.
// Depending on the grant that wrote client secrets, end-user passwords, authorization codes, PKCE
// verifiers, refresh tokens, JWT assertions and token-exchange subject/actor tokens to disk.
//
// This file is the regression net for the prohibition. It drives every grant shape whose body carries a
// credential through a spy logger and asserts the value never reaches a log line — while also asserting
// the length still does, so "log nothing at all" cannot pass instead.

/** Distinctive values, because asserting on the parameter *names* would false-positive on the
 *  legitimate messages "URL-en**code**d parameters length" and "de**code**d Basic auth". */
const SENTINELS = {
  clientSecret: "SENTINEL-client-secret-8f3a",
  password: "SENTINEL-password-1c7b",
  code: "SENTINEL-authorization-code-4d2e",
  codeVerifier: "SENTINEL-code-verifier-9a5f",
  refreshToken: "SENTINEL-refresh-token-6b1d",
  assertion: "SENTINEL-assertion-2e8c",
  subjectToken: "SENTINEL-subject-token-7f4a",
  actorToken: "SENTINEL-actor-token-3c9b",
  revokedToken: "SENTINEL-revoked-token-5a2d",
}

/** The `name=` forms are unambiguous once the `=` is required, and they catch a future change that
 *  logs the body under some other key or serialization. */
const CREDENTIAL_PARAMS = [
  "client_secret=",
  "username=",
  "password=",
  "code=",
  "code_verifier=",
  "refresh_token=",
  "assertion=",
  "subject_token=",
  "actor_token=",
  "token=",
]

/** A CallableLogger-shaped spy: callable, plus .error/.warn/.child, all capturing. */
function spyLogger() {
  const lines: string[] = []
  const capture = (msg: string, meta?: Record<string, unknown>) => {
    lines.push(`${msg} ${JSON.stringify(meta ?? {})}`)
  }
  const log = vi.fn(capture) as unknown as CallableLogger
  log.error = vi.fn(capture)
  log.warn = vi.fn(capture)
  log.child = vi.fn(() => log)
  return { log, lines }
}

function expectNoCredentialLogged(lines: string[]) {
  const captured = lines.join("\n")
  expect(captured.length, "the service logged nothing — the assertions below would be vacuous").toBeGreaterThan(0)

  for (const [name, value] of Object.entries(SENTINELS)) {
    expect(captured, `${name} reached a log line:\n${captured}`).not.toContain(value)
  }
  for (const param of CREDENTIAL_PARAMS) {
    expect(captured, `\`${param}\` reached a log line:\n${captured}`).not.toContain(param)
  }
}

/** What body-parser hands the service: the raw string plus its parsed form. */
const requestFor = (rawBody: string | undefined, log: CallableLogger, headers: Record<string, string> = {}) =>
  ({
    headers,
    body: rawBody ? Object.fromEntries(new URLSearchParams(rawBody)) : {},
    rawBody,
    logger: log,
  }) as any

describe("credential logging (RFC 9700 §4.2.4)", () => {
  describe("TokenService", () => {
    let mockApi: Authlete
    let service: TokenService

    beforeEach(() => {
      mockApi = createMockAuthlete() as unknown as Authlete
      service = new TokenService(mockApi)
      vi.mocked(mockApi.token.process).mockResolvedValue({ action: "OK" } as any)
    })

    const grants = [
      {
        name: "password (ROPC)",
        rawBody:
          "grant_type=password&username=admin" +
          `&password=${SENTINELS.password}` +
          `&client_id=demo-client&client_secret=${SENTINELS.clientSecret}`,
      },
      {
        name: "authorization_code with PKCE, client_secret_post",
        rawBody:
          "grant_type=authorization_code" +
          `&code=${SENTINELS.code}&code_verifier=${SENTINELS.codeVerifier}` +
          "&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback" +
          `&client_id=demo-client&client_secret=${SENTINELS.clientSecret}`,
      },
      {
        name: "refresh_token",
        rawBody:
          "grant_type=refresh_token" +
          `&refresh_token=${SENTINELS.refreshToken}` +
          `&client_id=demo-client&client_secret=${SENTINELS.clientSecret}`,
      },
      {
        name: "jwt-bearer",
        rawBody:
          "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer" +
          `&assertion=${SENTINELS.assertion}&client_id=demo-client`,
      },
      {
        name: "token exchange",
        rawBody:
          "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange" +
          `&subject_token=${SENTINELS.subjectToken}&actor_token=${SENTINELS.actorToken}` +
          "&subject_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Aaccess_token" +
          `&client_id=demo-client&client_secret=${SENTINELS.clientSecret}`,
      },
    ]

    it.each(grants)("does not log the request body of a $name request", async ({ rawBody }) => {
      const { log, lines } = spyLogger()
      await service.process(requestFor(rawBody, log))
      expectNoCredentialLogged(lines)
    })

    it("does not log the rebuilt parameters when rawBody is absent", async () => {
      // The fallback at token.service.ts:44-55 excludes only client_id/client_secret/properties, so the
      // string it rebuilds still carries username, password, code, code_verifier and refresh_token.
      const { log, lines } = spyLogger()
      const req = requestFor(undefined, log)
      req.body = {
        grant_type: "password",
        username: "admin",
        password: SENTINELS.password,
        client_id: "demo-client",
        client_secret: SENTINELS.clientSecret,
      }

      await service.process(req)

      expect(vi.mocked(mockApi.token.process).mock.calls[0][0].tokenRequest.parameters).toContain(
        SENTINELS.password,
      )
      expectNoCredentialLogged(lines)
    })

    it("does not log a secret presented as Basic auth", async () => {
      const { log, lines } = spyLogger()
      const basic = Buffer.from(`demo-client:${SENTINELS.clientSecret}`).toString("base64")

      await service.process(
        requestFor("grant_type=client_credentials&scope=openid", log, {
          authorization: `Basic ${basic}`,
        }),
      )

      expectNoCredentialLogged(lines)
      // The line that decodes it stays useful: the client is identified, the secret is not.
      expect(lines.join("\n")).toContain("demo-client")
    })

    it("still logs the parameter length, twice, so the request stays diagnosable", async () => {
      const { log, lines } = spyLogger()
      const rawBody = `grant_type=refresh_token&refresh_token=${SENTINELS.refreshToken}`

      await service.process(requestFor(rawBody, log))

      const captured = lines.join("\n")
      expect(captured).toContain("TokenService: URL-encoded parameters length")
      expect(captured).toContain(`"length":${rawBody.length}`)
      expect(captured).toContain(`"parametersLength":${rawBody.length}`)
    })
  })

  describe("RevocationService", () => {
    let mockApi: Authlete
    let service: RevocationService

    beforeEach(() => {
      mockApi = createMockAuthlete() as unknown as Authlete
      service = new RevocationService(mockApi)
      vi.mocked(mockApi.revocation.process).mockResolvedValue({ action: "OK" } as any)
    })

    it("does not log the request body, which is the token being revoked", async () => {
      const { log, lines } = spyLogger()
      const rawBody =
        `token=${SENTINELS.revokedToken}&token_type_hint=refresh_token` +
        `&client_id=demo-client&client_secret=${SENTINELS.clientSecret}`

      await service.process(requestFor(rawBody, log))

      expectNoCredentialLogged(lines)
    })

    it("does not log a secret presented as Basic auth", async () => {
      const { log, lines } = spyLogger()
      const basic = Buffer.from(`demo-client:${SENTINELS.clientSecret}`).toString("base64")

      await service.process(
        requestFor(`token=${SENTINELS.revokedToken}`, log, { authorization: `Basic ${basic}` }),
      )

      expectNoCredentialLogged(lines)
      expect(lines.join("\n")).toContain("demo-client")
    })

    it("does not log the rebuilt parameters when rawBody is absent", async () => {
      const { log, lines } = spyLogger()
      const req = requestFor(undefined, log)
      req.body = { token: SENTINELS.revokedToken }

      await service.process(req)

      expect(
        vi.mocked(mockApi.revocation.process).mock.calls[0][0].revocationRequest.parameters,
      ).toContain(SENTINELS.revokedToken)
      expectNoCredentialLogged(lines)
    })

    it("still logs the parameter length, twice, so the request stays diagnosable", async () => {
      const { log, lines } = spyLogger()
      const rawBody = `token=${SENTINELS.revokedToken}`

      await service.process(requestFor(rawBody, log))

      const captured = lines.join("\n")
      expect(captured).toContain("RevocationService: URL-encoded parameters length")
      expect(captured).toContain(`"length":${rawBody.length}`)
      expect(captured).toContain(`"parametersLength":${rawBody.length}`)
    })
  })
})
