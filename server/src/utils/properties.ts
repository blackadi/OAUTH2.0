/**
 * Extra properties to associate with an access token.
 *
 * Authlete types `properties` as an array of `{key, value, hidden}` objects on every
 * endpoint that accepts it — `/auth/token`, `/auth/token/issue`, `/auth/authorization/issue`,
 * `/auth/token/create`, `/auth/token/update`, `/device/complete` and
 * `/backchannel/authentication/complete`. It is never a JSON string on the wire.
 *
 * See https://www.authlete.com/developers/definitive_guide/extra_properties/
 */
export type ExtraProperty = { key?: string; value?: string; hidden?: boolean };

/**
 * Normalize a caller-supplied `properties` value into the array shape Authlete expects.
 *
 * Accepts an array as-is, or a JSON string encoding an array. Anything else — including a
 * JSON string that decodes to a non-array — yields `undefined` so the field is omitted
 * rather than forwarded in a shape Authlete would reject.
 */
export function parseProperties(input: unknown): Array<ExtraProperty> | undefined {
  if (!input) return undefined;
  if (Array.isArray(input)) return input;
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
