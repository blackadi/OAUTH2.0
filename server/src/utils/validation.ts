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
