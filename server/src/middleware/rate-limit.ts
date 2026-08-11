import rateLimit from "express-rate-limit";

export const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !!req.headers.authorization?.startsWith("Basic "),
  message: { error: "too_many_requests", message: "Too many requests, please try again later." },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Too many requests, please try again later." },
});

export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Too many login attempts, please try again later." },
});

/**
 * User-code submission on the device flow.
 *
 * RFC 8628 §5.1: *"it is recommended that the server rate-limit user code attempts."* The RFC's own worked
 * example assumes an 8-character BASE20 code (~34.5 bits) and *"the rate-limiting interval and validity period
 * would need to only allow 5 attempts"* to reach a 2^-32 guessing probability. `deviceFlowCodeDuration` is 600 s
 * on this service, so 5/min over a 10-minute window is ~50 attempts against ~34.5 bits — the RFC's assumption
 * with margin, and far tighter than `generalLimiter`'s 60/min.
 */
export const deviceCodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Too many user code attempts, please try again later." },
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Too many requests, please try again later." },
});
