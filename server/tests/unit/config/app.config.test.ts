import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * `app.config.ts` calls `configDotenv()` at module scope, and a developer's `server/.env` sets
 * `NODE_ENV=development` — so deleting the variable and re-importing would just re-read it off disk, and the
 * result would depend on whose machine ran the test. The unit under test is the `||` fallback, not dotenv,
 * so dotenv is a no-op here. (Found the hard way: these cases passed alone and failed in the full suite.)
 */
vi.mock("dotenv", () => ({ configDotenv: () => ({ parsed: {} }), default: { config: () => ({ parsed: {} }) } }))

/**
 * The `nodeEnv` **default** is a security control, and it is what was wrong.
 *
 * `middleware/development-only.ts` already tests the gate across `["production","test",undefined]` — but it
 * mocks the config module, so it asserts what the gate does *given* a value and can say nothing about which
 * value an unset `NODE_ENV` produces. That gap is the whole defect: verified on the live deployment
 * 2026-08-13, `NODE_ENV` was unset, `app.config.ts` resolved `"development"`, and
 * `POST /api/device/complete` — which approves a device authorization as any subject the caller names, with
 * no authentication of that subject — was reachable on the public internet. The gate was correct and the
 * default disabled it.
 *
 * So these tests import the real config with `process.env` manipulated, and assert the resolution itself.
 * `app.config.ts` reads `process.env` at module scope, which is right for a server that boots once, so each
 * case needs `vi.resetModules()` and a fresh dynamic import rather than `vi.stubEnv` after the fact.
 */
describe("app.config — the nodeEnv default fails safe", () => {
  const ORIGINAL = process.env.NODE_ENV

  beforeEach(() => {
    vi.resetModules()
    // `required("SESSION_SECRET")` throws if this is absent, and tests/setup.ts sets it — keep it set here
    // too, because these cases re-import the module fresh.
    process.env.SESSION_SECRET ||= "test-secret"
  })

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = ORIGINAL
    vi.resetModules()
  })

  async function loadConfig() {
    return (await import("../../../src/config/app.config")).server
  }

  // THE regression. An absent value must select the safest behaviour, not the most permissive one.
  it("resolves to production when NODE_ENV is unset", async () => {
    delete process.env.NODE_ENV

    expect((await loadConfig()).nodeEnv).toBe("production")
  })

  it("resolves to production when NODE_ENV is empty", async () => {
    process.env.NODE_ENV = ""

    expect((await loadConfig()).nodeEnv).toBe("production")
  })

  it.each(["development", "test", "staging"])("honours an explicit NODE_ENV=%s", async (env) => {
    process.env.NODE_ENV = env

    expect((await loadConfig()).nodeEnv).toBe(env)
  })

  // The consequence, asserted through the gate rather than restated. `developmentOnly` reads this exact
  // value, so an unset environment must now produce a 404 from it.
  it("makes developmentOnly refuse when NODE_ENV is unset", async () => {
    delete process.env.NODE_ENV
    const { developmentOnly } = await import("../../../src/middleware/development-only")

    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    const next = vi.fn()
    developmentOnly({} as never, res as never, next)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(next).not.toHaveBeenCalled()
  })

  describe("logLevel follows the same default", () => {
    it("is info when NODE_ENV is unset, not debug", async () => {
      delete process.env.NODE_ENV
      delete process.env.LOG_LEVEL

      expect((await loadConfig()).logLevel).toBe("info")
    })

    it("is debug under an explicit development environment", async () => {
      process.env.NODE_ENV = "development"
      delete process.env.LOG_LEVEL

      expect((await loadConfig()).logLevel).toBe("debug")
    })

    it("an explicit LOG_LEVEL still wins", async () => {
      delete process.env.NODE_ENV
      process.env.LOG_LEVEL = "warn"

      expect((await loadConfig()).logLevel).toBe("warn")
      delete process.env.LOG_LEVEL
    })
  })
})
