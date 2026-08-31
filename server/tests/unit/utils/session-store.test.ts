import { describe, it, expect, vi } from "vitest"
import expressSession, { type Store } from "express-session"
import { destroySessionsForSubject } from "../../../src/utils/session-store"
import type { Logger } from "winston"

const mockLog = () =>
  ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: vi.fn() }) as unknown as Logger

/**
 * The two supported stores return different shapes from `all()`. express-session's MemoryStore builds an
 * object keyed by session id, while connect-redis pushes an array and attaches `sess.id`. A helper that
 * handles only one silently terminates nothing against the other — which is the whole failure mode this
 * function exists to avoid.
 *
 * **The connect-redis fake below is evidenced, not invented** (2026-08-17). It was originally written from a
 * *reading* of the library, and there is no test here that runs real connect-redis — CI has no Redis. So the
 * shape was checked by hand against a live `redis:7-alpine`, writing three sessions and calling `all()`:
 *
 * | | `Array.isArray` | elements with a string `.id` | `destroySessionsForSubject` result |
 * |---|---|---|---|
 * | connect-redis **9.0.0** (installed) | `true` | 3 of 3 | found both of alice's, spared bob's |
 * | connect-redis **10.0.0** (PR #22) | `true` | 3 of 3 | identical |
 *
 * Two reasons that mattered. `REDIS_URL` is now set, so **connect-redis is the live store** and this branch
 * is the live path rather than the hypothetical one. And the v10 check settles the pending major bump on the
 * dimension that could have broken it silently: v10's only breaking change is `engines.node` 18 → 22.
 *
 * Re-run it by hand if this fake ever needs to change — `docker compose up -d redis` and drive `store.all()`
 * directly. A fake that nobody has compared against the real thing is a guess with a green tick next to it.
 */
function storeReturning(sessions: unknown, destroy = vi.fn((_sid, cb) => cb?.(null))): Store {
  return {
    all: vi.fn((cb: (err: unknown, s: unknown) => void) => cb(null, sessions)),
    destroy,
  } as unknown as Store
}

describe("destroySessionsForSubject", () => {
  it("terminates the subject's sessions and spares everyone else's — MemoryStore shape", async () => {
    const destroy = vi.fn((_sid, cb) => cb?.(null))
    const store = storeReturning(
      {
        "sid-alice-1": { user: "alice" },
        "sid-bob": { user: "bob" },
        "sid-alice-2": { user: "alice" },
        "sid-anon": {},
      },
      destroy,
    )

    const count = await destroySessionsForSubject(store, "alice", mockLog())

    expect(count).toBe(2)
    const destroyed = destroy.mock.calls.map((c) => c[0]).sort()
    expect(destroyed).toEqual(["sid-alice-1", "sid-alice-2"])
    expect(destroyed).not.toContain("sid-bob")
  })

  it("terminates the subject's sessions — connect-redis shape (array with .id)", async () => {
    const destroy = vi.fn((_sid, cb) => cb?.(null))
    const store = storeReturning(
      [
        { id: "sid-alice", user: "alice" },
        { id: "sid-bob", user: "bob" },
      ],
      destroy,
    )

    const count = await destroySessionsForSubject(store, "alice", mockLog())

    expect(count).toBe(1)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(destroy.mock.calls[0][0]).toBe("sid-alice")
  })

  it("ignores array entries carrying no id rather than destroying by undefined", async () => {
    const destroy = vi.fn((_sid, cb) => cb?.(null))
    const store = storeReturning([{ user: "alice" }], destroy)

    expect(await destroySessionsForSubject(store, "alice", mockLog())).toBe(0)
    expect(destroy).not.toHaveBeenCalled()
  })

  it("returns 0 when the subject has no sessions", async () => {
    const store = storeReturning({ "sid-bob": { user: "bob" } })
    expect(await destroySessionsForSubject(store, "alice", mockLog())).toBe(0)
  })

  it("reports null, without throwing, when the store cannot enumerate", async () => {
    // The logout token was valid; failing loudly here would blame the sending OP for our limitation.
    const log = mockLog()
    const store = { destroy: vi.fn() } as unknown as Store

    expect(await destroySessionsForSubject(store, "alice", log)).toBeNull()
    expect(log.error).toHaveBeenCalled()
  })

  it("reports null for an absent store", async () => {
    expect(await destroySessionsForSubject(undefined, "alice", mockLog())).toBeNull()
  })

  it("keeps going when one destroy fails — a partial logout beats none", async () => {
    const log = mockLog()
    const destroy = vi.fn((sid: string, cb: (e: unknown) => void) =>
      cb(sid === "sid-1" ? new Error("redis down") : null),
    )
    const store = storeReturning({ "sid-1": { user: "alice" }, "sid-2": { user: "alice" } }, destroy)

    expect(await destroySessionsForSubject(store, "alice", log)).toBe(2)
    expect(destroy).toHaveBeenCalledTimes(2)
    expect(log.error).toHaveBeenCalled()
  })

  it("propagates a store enumeration error to the caller", async () => {
    const store = {
      all: vi.fn((cb: (e: unknown) => void) => cb(new Error("store exploded"))),
      destroy: vi.fn(),
    } as unknown as Store

    await expect(destroySessionsForSubject(store, "alice", mockLog())).rejects.toThrow("store exploded")
  })

  /**
   * The tests above assert against my *reading* of each store's `all()`. This one runs the real
   * express-session MemoryStore, so the shape claim is verified rather than assumed — which matters,
   * because the shapes differ and handling only one silently terminates nothing.
   */
  describe("against the real express-session MemoryStore", () => {
    const seed = (store: Store, sid: string, user: string) =>
      new Promise<void>((resolve, reject) =>
        store.set(sid, { user, cookie: { originalMaxAge: 60_000 } } as never, (e) =>
          e ? reject(e) : resolve(),
        ),
      )
    const get = (store: Store, sid: string) =>
      new Promise<unknown>((resolve) => store.get(sid, (_e, s) => resolve(s)))

    it("ends alice's sessions and leaves bob's alone", async () => {
      const store = new expressSession.MemoryStore()
      await seed(store, "sid-alice-1", "alice")
      await seed(store, "sid-alice-2", "alice")
      await seed(store, "sid-bob", "bob")

      const count = await destroySessionsForSubject(store, "alice", mockLog())

      expect(count).toBe(2)
      expect(await get(store, "sid-alice-1")).toBeFalsy()
      expect(await get(store, "sid-alice-2")).toBeFalsy()
      // The whole point: one user's logout must not end another's session.
      expect(await get(store, "sid-bob")).toMatchObject({ user: "bob" })
    })
  })
})
