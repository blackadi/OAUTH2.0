/**
 * Merge fields into a URL-encoded parameter string, preserving what is already there.
 *
 * Used to place client credentials on the `client_secret_post` channel — inside Authlete's `parameters`
 * string — as opposed to the `client_secret_basic` channel, which travels as top-level `clientId` /
 * `clientSecret`. Authlete matches the channel the credentials arrive on against the client's registered
 * authentication method, so which of the two a service picks is a correctness question, not a style one:
 * put a `client_secret_basic` client's credentials in `parameters` and you earn
 * `401 [A157357] The client identifier is not found at the expected location`.
 *
 * Shared by `par.service.ts` and `ciba.service.ts`. It lives here rather than as a private method on one of
 * them because this repo has already paid for the alternative: four hand-rolled bearer parsers and two
 * Basic decoders, each subtly different, found one at a time. `AGENTS.md` states the rule.
 *
 * `set` rather than `append`: a caller-supplied `client_id` in `parameters` must be replaced by the
 * authenticated one, not duplicated — a duplicated key is a parameter the AS may read either way.
 */
export function appendToParams(
  params: string,
  fields: Array<{ key: string; value: string }>,
): string {
  const searchParams = new URLSearchParams(params);
  for (const { key, value } of fields) {
    searchParams.set(key, value);
  }
  return searchParams.toString();
}
