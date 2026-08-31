import type { Store, SessionData } from "express-session";
import type { Logger } from "winston";

/**
 * Destroy every stored session belonging to a subject.
 *
 * This exists for OpenID Connect Back-Channel Logout §2.6 step 8, which requires the RP to *"clear any state
 * for the End-User"* named by the logout token. Until 2026-08-13 the receiving endpoint called
 * `req.session.destroy()` instead — the session of *the caller*, which is another OP's server posting
 * server-to-server and has no browser session at all. It therefore destroyed nothing, returned `200`, and the
 * sending OP believed the user had been logged out.
 *
 * **The two supported stores disagree about what `all()` returns, and a naive implementation silently no-ops
 * against one of them.** Both were read to establish this, not inferred:
 *
 * | Store | `all(cb)` yields |
 * |---|---|
 * | `express-session` MemoryStore | an **object keyed by session id**; the session values carry no `id` |
 * | `connect-redis` | an **array**, each element with `sess.id` attached |
 *
 * So both shapes are normalised to `[sid, session]` pairs here.
 *
 * **`sid` is deliberately not matched.** This deployment issues no `sid` into its own sessions (OIDC Session
 * Management is declined), so there is nothing to match a token's `sid` against. §2.6 step 5 requires only
 * that `sub` or `sid` be *present* in the token, which the caller enforces.
 */
export async function destroySessionsForSubject(
  store: Store | undefined,
  subject: string,
  log: Logger,
): Promise<number | null> {
  if (!store || typeof store.all !== "function") {
    // Never throw: the logout token was valid, and answering the sending OP with an error would blame it for
    // our own limitation. Both stores this deployment can use do implement `all`, so this is defensive.
    log.error("Back-channel logout: session store cannot enumerate sessions; no session was terminated", {
      subject,
    });
    return null;
  }

  const entries = await new Promise<[string, SessionData][]>((resolve, reject) => {
    store.all!((err, sessions) => {
      if (err) return reject(err instanceof Error ? err : new Error(String(err)));
      if (!sessions) return resolve([]);

      if (Array.isArray(sessions)) {
        // connect-redis: each element carries its own id.
        resolve(
          sessions
            .map((s) => [(s as SessionData & { id?: string }).id, s] as [string | undefined, SessionData])
            .filter((pair): pair is [string, SessionData] => typeof pair[0] === "string"),
        );
        return;
      }
      // MemoryStore: an object keyed by session id.
      resolve(Object.entries(sessions as Record<string, SessionData>));
    });
  });

  const doomed = entries.filter(([, s]) => s?.user === subject).map(([sid]) => sid);

  await Promise.all(
    doomed.map(
      (sid) =>
        new Promise<void>((resolve) => {
          store.destroy(sid, (err) => {
            // One failure must not abandon the rest: a partial logout is still better than none.
            if (err) log.error("Back-channel logout: failed to destroy a session", { sid, subject });
            resolve();
          });
        }),
    ),
  );

  return doomed.length;
}
