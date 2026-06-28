import { describe, it, expect } from "vitest";
import {
  validateOrThrow,
  cibaAuthenticationSchema,
  cibaIssueSchema,
  cibaFailSchema,
  cibaCompleteSchema,
  deviceAuthorizationSchema,
  deviceVerificationSchema,
  deviceCompleteSchema,
  parSchema,
  dcrRegisterSchema,
  dcrGetSchema,
  dcrUpdateSchema,
  dcrDeleteSchema,
  loginSchema,
  tokenSchema,
  backchannelLogoutIssueSchema,
  backchannelLogoutDeliverSchema,
} from "../../../src/utils/validation";

describe("validateOrThrow", () => {
  it("returns parsed data for valid input", () => {
    const result = validateOrThrow(loginSchema, { username: "admin", password: "secret" });
    expect(result).toEqual({ username: "admin", password: "secret" });
  });

  it("throws AppError with 400 for missing required field", () => {
    try {
      validateOrThrow(loginSchema, { username: "admin" });
      expect.unreachable();
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(e.message).toContain("Missing required field");
    }
  });

  it("throws AppError with 400 for empty required field", () => {
    try {
      validateOrThrow(cibaIssueSchema, { ticket: "" });
      expect.unreachable();
    } catch (e: any) {
      expect(e.status).toBe(400);
    }
  });
});

describe("cibaAuthenticationSchema", () => {
  it("accepts valid input", () => {
    const data = validateOrThrow(cibaAuthenticationSchema, { parameters: "login_hint=user1" });
    expect(data.parameters).toBe("login_hint=user1");
  });

  it("rejects missing parameters", () => {
    try {
      validateOrThrow(cibaAuthenticationSchema, {});
      expect.unreachable();
    } catch (e: any) {
      expect(e.status).toBe(400);
    }
  });
});

describe("cibaIssueSchema", () => {
  it("accepts valid ticket", () => {
    const data = validateOrThrow(cibaIssueSchema, { ticket: "tkt-1" });
    expect(data.ticket).toBe("tkt-1");
  });
});

describe("cibaFailSchema", () => {
  it("accepts ticket and reason", () => {
    const data = validateOrThrow(cibaFailSchema, { ticket: "tkt-1", reason: "ACCESS_DENIED" });
    expect(data.ticket).toBe("tkt-1");
    expect(data.reason).toBe("ACCESS_DENIED");
  });
});

describe("cibaCompleteSchema", () => {
  it("accepts ticket, result, subject", () => {
    const data = validateOrThrow(cibaCompleteSchema, { ticket: "tkt-1", result: "AUTHORIZED", subject: "user1" });
    expect(data.subject).toBe("user1");
  });
});

describe("deviceAuthorizationSchema", () => {
  it("accepts valid input", () => {
    const data = validateOrThrow(deviceAuthorizationSchema, { parameters: "scope=openid" });
    expect(data.parameters).toBe("scope=openid");
  });
});

describe("deviceVerificationSchema", () => {
  it("accepts userCode", () => {
    const data = validateOrThrow(deviceVerificationSchema, { userCode: "ABC-123" });
    expect(data.userCode).toBe("ABC-123");
  });
});

describe("deviceCompleteSchema", () => {
  it("accepts userCode, result, subject", () => {
    const data = validateOrThrow(deviceCompleteSchema, { userCode: "ABC-123", result: "approve", subject: "user1" });
    expect(data.result).toBe("approve");
  });
});

describe("parSchema", () => {
  it("accepts valid input", () => {
    const data = validateOrThrow(parSchema, { parameters: "response_type=code&client_id=c1" });
    expect(data.parameters).toBe("response_type=code&client_id=c1");
  });
});

describe("dcrRegisterSchema", () => {
  it("accepts json string", () => {
    const data = validateOrThrow(dcrRegisterSchema, { json: '{"client_name":"test"}' });
    expect(data.json).toBe('{"client_name":"test"}');
  });
});

describe("dcrGetSchema", () => {
  it("accepts token and clientId", () => {
    const data = validateOrThrow(dcrGetSchema, { token: "tok-1", clientId: "c-1" });
    expect(data.clientId).toBe("c-1");
  });
});

describe("dcrUpdateSchema", () => {
  it("accepts json, token, clientId", () => {
    const data = validateOrThrow(dcrUpdateSchema, { json: "{}", token: "tok-1", clientId: "c-1" });
    expect(data.token).toBe("tok-1");
  });
});

describe("dcrDeleteSchema", () => {
  it("accepts token and clientId", () => {
    const data = validateOrThrow(dcrDeleteSchema, { token: "tok-1", clientId: "c-1" });
    expect(data.token).toBe("tok-1");
  });
});

describe("loginSchema", () => {
  it("accepts username and password", () => {
    const data = validateOrThrow(loginSchema, { username: "admin", password: "pass" });
    expect(data.username).toBe("admin");
  });
});

describe("tokenSchema", () => {
  it("accepts grant_type", () => {
    const data = validateOrThrow(tokenSchema, { grant_type: "authorization_code" });
    expect(data.grant_type).toBe("authorization_code");
  });
});

describe("backchannelLogoutIssueSchema", () => {
  it("accepts sub with optional sid", () => {
    const data = validateOrThrow(backchannelLogoutIssueSchema, { sub: "user1" });
    expect(data.sub).toBe("user1");
  });

  it("accepts sub with sid", () => {
    const data = validateOrThrow(backchannelLogoutIssueSchema, { sub: "user1", sid: "sess-1" });
    expect(data.sid).toBe("sess-1");
  });
});

describe("backchannelLogoutDeliverSchema", () => {
  it("accepts sub with optional sid", () => {
    const data = validateOrThrow(backchannelLogoutDeliverSchema, { sub: "user1" });
    expect(data.sub).toBe("user1");
  });
});
