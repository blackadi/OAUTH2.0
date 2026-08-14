import { z, ZodType } from "zod";
import { AppError } from "./app-error";

export function validateOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = (result.error as any).issues || [];
    const first = issues[0];
    if (first && first.path.length > 0 && first.code === "invalid_type") {
      throw new AppError(`Missing required field: ${first.path.join(".")}`, 400);
    }
    throw new AppError(first ? first.message : "Validation failed", 400);
  }
  return result.data;
}

function required(field: string) {
  return `Missing required field: ${field}`;
}

export const cibaAuthenticationSchema = z.object({
  parameters: z.string().min(1, required("parameters")),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

export const cibaIssueSchema = z.object({
  ticket: z.string().min(1, required("ticket")),
});

export const cibaFailSchema = z.object({
  ticket: z.string().min(1, required("ticket")),
  reason: z.string().min(1, required("reason")),
});

export const cibaCompleteSchema = z.object({
  ticket: z.string().min(1, required("ticket")),
  result: z.string().min(1, required("result")),
  subject: z.string().min(1, required("subject")),
  acr: z.string().optional(),
  authTime: z.number().optional(),
  claims: z.string().optional(),
});

export const deviceAuthorizationSchema = z.object({
  parameters: z.string().min(1, required("parameters")),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

export const deviceVerificationSchema = z.object({
  userCode: z.string().min(1, required("userCode")),
});

export const deviceCompleteSchema = z.object({
  userCode: z.string().min(1, required("userCode")),
  result: z.string().min(1, required("result")),
  subject: z.string().min(1, required("subject")),
  acr: z.string().optional(),
  authTime: z.number().optional(),
  claims: z.string().optional(),
});

export const parSchema = z.object({
  parameters: z.string().min(1, required("parameters")),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

export const dcrRegisterSchema = z.object({
  json: z.string().min(1, required("json")),
});

export const dcrGetSchema = z.object({
  token: z.string().min(1, required("token")),
  clientId: z.string().min(1, required("clientId")),
});

export const dcrUpdateSchema = z.object({
  json: z.string().min(1, required("json")),
  token: z.string().min(1, required("token")),
  clientId: z.string().min(1, required("clientId")),
});

export const dcrDeleteSchema = z.object({
  token: z.string().min(1, required("token")),
  clientId: z.string().min(1, required("clientId")),
});

export const loginSchema = z.object({
  username: z.string().min(1, required("username")),
  password: z.string().min(1, required("password")),
});

export const tokenSchema = z.object({
  grant_type: z.string()
    .min(1, "Missing required parameter: grant_type"),
});

export const backchannelLogoutIssueSchema = z.object({
  sub: z.string().min(1, required("sub")),
  sid: z.string().optional(),
});

export const backchannelLogoutDeliverSchema = z.object({
  sub: z.string().min(1, required("sub")),
  sid: z.string().optional(),
});

export const federationRegistrationSchema = z.object({
  entityConfiguration: z.string().optional(),
  trustChain: z.string().optional(),
}).refine(
  (data) => data.entityConfiguration || data.trustChain,
  { message: "Missing required field: entityConfiguration or trustChain" }
);

export const nativeSsoProcessSchema = z.object({
  accessToken: z.string().min(1, required("accessToken")),
  deviceSecret: z.string().min(1, required("deviceSecret")),
  refreshToken: z.string().optional(),
  sub: z.string().optional(),
  claims: z.string().optional(),
  idtHeaderParams: z.string().optional(),
  idTokenAudType: z.string().optional(),
  deviceSecretHash: z.string().optional(),
});

export const nativeSsoLogoutSchema = z.object({
  sessionId: z.string().min(1, required("sessionId")),
});

/**
 * Authlete's client `attributes` — an array of key/value pairs (SDK 1.0.0 `Pair`).
 *
 * ATTR-W1. This was the one field `buildClientInput` forwarded with `as any`. Every other field in that
 * mapper is coerced (`String(…)`, `Number(…)`) or cast to a named SDK type, so a malformed `attributes`
 * was the only client input that crossed the Authlete boundary unexamined — and a *non-array* was
 * silently dropped, which reports success for a setting that never took effect.
 *
 * **Stricter than the SDK on one point, deliberately.** `Pair` makes *both* members optional, so `[{}]`
 * satisfies it. An attribute with no key cannot be addressed by anything, and the namespace is not
 * inert — Authlete assigns meaning to some keys, which is how the `regex` *scope* attribute drives
 * parameterized scopes. So a keyless entry is a silent no-op rather than a setting, and is refused.
 * `value` stays optional, matching `Pair`.
 */
export const clientAttributesSchema = z.array(
  z.object({
    key: z.string().min(1, "Client attribute entries require a non-empty `key`"),
    value: z.string().optional(),
  }),
);
