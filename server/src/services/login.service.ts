import logger from "../utils/logger";
import { otpAuthUri, verifyTotp } from "../utils/totp";

function requiredUsers(): Array<{ subject: string; username: string; password: string; name: string }> {
  const raw = process.env.AUTH_USERS;
  if (!raw) {
    // Default demo user if none configured (log a warning)
    logger.warn("AUTH_USERS not set. Using default demo user admin:password. Set AUTH_USERS=subject:username:password:name;subject2:...");
    return [{ subject: "admin", username: "admin", password: "password", name: "Administrator" }];
  }
  return raw.split(";").map((entry) => {
    const [subject, username, password, name] = entry.split(":");
    return { subject, username, password, name };
  });
}

const users = requiredUsers();

/**
 * RFC 9470 second factor for this demo. One shared secret for every demo user, not a per-user enrollment
 * flow — that is a deliberate toy-scope decision (see `docs/investigations/toy-otp-feasibility.md`), the
 * same spirit as `AUTH_USERS` being a plaintext env-var tuple rather than a real credential store.
 *
 * `AUTH_OTP_SECRET` follows `AUTH_USERS`'s own pattern exactly: optional, `logger.warn` + a baked-in
 * default when unset — never `utils/env.ts`'s `required()`, which is for startup-fatal configuration.
 * The default decodes (base32) to the ASCII string "Authlete Demo OTP!!", picked and self-checked against
 * RFC 4648 §10's published vectors while writing this — see `tests/unit/utils/totp.test.ts`.
 */
function requiredOtpSecret(): string {
  const raw = process.env.AUTH_OTP_SECRET;
  if (!raw) {
    logger.warn("AUTH_OTP_SECRET not set. Using the baked-in demo TOTP secret. Set AUTH_OTP_SECRET=<base32> to override.");
    return "IF2XI2DMMV2GKICEMVWW6ICPKRICCII";
  }
  return raw;
}

const otpSecret = requiredOtpSecret();

export class LoginService {
  validateUser(username: string, password: string) {
    const user = users.find(
      (u) => u.username === username && u.password === password
    );
    if (!user) return null;
    return { subject: user.subject, name: user.name };
  }

  verifyOtp(code: string): boolean {
    return verifyTotp(code, otpSecret);
  }

  /** For display on the OTP entry page — never logged, never sent anywhere but rendered to the demo user. */
  otpEnrollmentInfo(): { secret: string; otpauthUri: string } {
    return {
      secret: otpSecret,
      otpauthUri: otpAuthUri(otpSecret, "Authlete Node Authz Server", "demo"),
    };
  }
}
