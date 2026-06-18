# OAuth2.0 / OpenID Connect Security Audit & Implementation Review

**Repository:** `blackadi/authlete-node-authz-server`  
**SDK Used:** `@authlete/typescript-sdk@0.0.5-beta`  
**Date:** June 2026  
**Status:** ✅ Comprehensive Review Complete

---

## Executive Summary

Your Authlete Node.js Authorization Server implementation demonstrates **good OAuth2.0/OpenID Connect compliance** with proper use of the Authlete SDK for core flows. However, there are **critical security improvements**, **best practice enhancements**, and **production-readiness gaps** that must be addressed.

### Overall Grade: **B+ (Good, with areas for improvement)**

- ✅ **Strengths:** Core endpoints implemented, SDK properly utilized, logging infrastructure
- ⚠️ **Concerns:** Configuration security, error handling, session management, input validation
- 🔴 **Critical:** Missing security headers, weak PKCE handling, insufficient CSRF protection

---

## 1. OAuth2.0 Specification Compliance Analysis

### 1.1 Authorization Endpoint (`/api/authorization`) - **Grade: B**

**✅ What's Implemented:**
- Accepts both GET and POST requests per OAuth2.0 spec (RFC 6749)
- Delegates authorization request processing to Authlete
- Captures response actions and handles appropriately
- Supports interactive flow with login/consent pages
- Stores session state for authentication context

**⚠️ Issues Found:**

```typescript
// server/src/controllers/authorization.controller.ts - LINE 42-76
// ISSUE: Unfiltered query parameters passed to redirect
const currentQueryParams = req.query;
const searchParams = new URLSearchParams(
  currentQueryParams as Record<string, string>
);
const newUrl = `${appConfig.loginUrl}?${searchParams.toString()}`;
return res.redirect(newUrl);
```

**Problem:** All query parameters are blindly forwarded. This could leak sensitive data or be exploited for parameter injection.

**🔴 Critical Findings:**

1. **Missing State Parameter Validation**
   - No explicit validation that `state` parameter is present
   - State should be mandatory for security (CSRF protection)
   - See RFC 6749 Section 10.12

2. **Missing PKCE Validation in Server** 
   - Code challenge not explicitly validated
   - Server delegates to Authlete correctly, but no server-side validation

3. **Loose Session Management**
   - Session data stored without encryption
   - Ticket and authorization context stored in plain session

---

### 1.2 Token Endpoint (`/api/token`) - **Grade: A-**

**✅ What's Implemented:**
- Supports multiple grant types (authorization_code, password, JWT Bearer, TOKEN_EXCHANGE)
- Proper HTTP header handling for content negotiation
- Basic auth decoding implemented correctly
- Client authentication (Basic auth) validated
- Appropriate error responses with proper status codes

**✅ Correct Behaviors:**
```typescript
// server/src/controllers/token.controller.ts - LINE 44-49
// ✅ GOOD: Correct Basic auth decoding
const { authorization } = req.headers;
if (authorization && authorization.startsWith("Basic ")) {
  const base64Credentials = authorization.slice("Basic ".length);
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
  [clientId, clientSecret] = credentials.split(":");
```

**⚠️ Areas for Improvement:**

1. **JWT Bearer Grant Implementation** (LINE 57-116)
   - ✅ Validates JWT assertion via JWKS endpoint
   - ⚠️ **Issue:** Uses hardcoded default JWKS URI as fallback
   ```typescript
   const jwksUri = jwks.uri || 
     "https://authlete-node-authz-server.onrender.com/api/.well-known/jwks.json";
   ```
   - **Recommendation:** Always require explicit JWKS_URI configuration

2. **Token Response Headers** (LINE 119-122)
   - ✅ Sets `Cache-Control: no-store` and `Pragma: no-cache` ✓
   - ✅ Sets Content-Type correctly ✓

3. **Missing Token Endpoint Auth Methods**
   - Only Basic auth implemented
   - Missing support for: `client_secret_post`, `client_secret_jwt`, `private_key_jwt`
   - Should support `client_assertion` per OAuth2.0 spec

---

### 1.3 UserInfo Endpoint (`/api/userinfo`) - **Grade: B**

**✅ What's Implemented:**
- Token extraction from Authorization header ✓
- Bearer token validation ✓
- RFC 6750 compliance for Bearer token errors ✓

**⚠️ Security Issues:**

1. **Missing Subject Validation** (LINE 71-89)
   ```typescript
   const subject = result.subject;
   const claimNames: string[] = result.claims || [];
   
   if (!subject) {
     // Error handling but...
   }
   ```
   - No validation that subject matches authorized user
   - No scope validation for requested claims
   - Should validate that `openid` scope is present

2. **Development-Mode Claim Synthesis** (LINE 97-136)
   - Synthetic claims are hardcoded for development
   - **CRITICAL:** This should never reach production
   - Should query actual user database
   - Missing proper claim mapping

3. **Missing Required OpenID Connect Claims**
   - Should always include `sub` (subject)
   - Should include `iat` (issued at)
   - Should include `aud` (audience) for ID tokens

---

### 1.4 Introspection Endpoint (`/api/introspection`) - **Grade: A**

**✅ What's Implemented:**
- RFC 7662 compliant response format ✓
- Proper error handling for invalid tokens ✓
- Client authentication required ✓
- Correct HTTP status codes ✓

**✅ Good Practices:**
```typescript
// server/src/controllers/introspection.controller.ts
case "OK":
  res.setHeader("Content-Type", "application/json");
  return res.send(result.responseContent);
```

---

### 1.5 Revocation Endpoint (`/api/revocation`) - **Grade: A**

**✅ What's Implemented:**
- RFC 7009 compliant ✓
- Proper client authentication ✓
- Correct handling of `token_type_hint` ✓
- Always returns 200 OK per spec ✓

**⚠️ Minor Issue:**
```typescript
// server/src/controllers/revocation.controller.ts - LINE 15
res.setHeader("Content-Type", "application/javascript"); // Should be application/json
```

---

## 2. Authlete SDK Usage Assessment

### 2.1 SDK Integration - **Grade: A**

**✅ Excellent Practices:**
```typescript
// server/src/services/authlete.service.ts
import { Authlete } from "@authlete/typescript-sdk";

export const authleteApi = new Authlete({
    bearer: authleteConfig.AccessToken,
    serverURL: authleteConfig.baseUrl
});
```

- ✅ Single Authlete instance for all operations
- ✅ Configuration externalized via environment variables
- ✅ Proper error propagation

### 2.2 SDK Version Check

**Current:** `@authlete/typescript-sdk@0.0.5-beta`  
**Status:** ⚠️ **BETA VERSION** - Not recommended for production

**Recommendations:**
1. Upgrade to latest stable version (check npm for current stable)
2. Review changelog for breaking changes
3. Update all SDK imports to use stable APIs

### 2.3 Service Layer Implementation - **Grade: B+**

**✅ Good Structure:**
- Separation of concerns (controllers → services → Authlete)
- Request transformation to Authlete format
- Proper error handling

**⚠️ Issues:**

1. **Token Service - Custom HTTP Call** (LINE 116-134)
   ```typescript
   if (reqBody.parameters.includes("refresh_token") || 
       reqBody.parameters.includes("access_token")) {
     const response = await fetch<TokenResponse>(
       `${process.env.AUTHLETE_BASE_URL}/api/${process.env.AUTHLETE_SERVICE_ID}/auth/token`,
       "POST",
       { parameters: reqBody.parameters, clientId, clientSecret }
     );
     return response;
   }
   ```
   - **Problem:** Bypasses Authlete SDK for specific scenarios
   - **Risk:** Direct HTTP calls are harder to maintain and debug
   - **Fix:** Use SDK exclusively

2. **Missing Request Validation** 
   - No schema validation before sending to Authlete
   - No rate limiting
   - No request sanitization

---

## 3. Security Assessment

### 3.1 Configuration Security - **Grade: D**

**🔴 CRITICAL ISSUES:**

1. **Hardcoded Default Session Secret**
   ```typescript
   // server/src/config/app.config.ts - LINE 13
   sessionSecret: process.env.SESSION_SECRET || "P@$sW0rd&Ch@ng3",
   ```
   - ❌ Default secret is visible in code
   - ❌ Will be used if env var not set
   - ❌ Compromises all sessions
   
   **Fix:**
   ```typescript
   sessionSecret: process.env.SESSION_SECRET || (() => {
     throw new Error('SESSION_SECRET environment variable is required');
   })(),
   ```

2. **Authlete Configuration**
   ```typescript
   // server/src/config/authlete.config.ts
   baseUrl: process.env.AUTHLETE_BASE_URL || "",
   AccessToken: process.env.AUTHLETE_ACCESS_TOKEN || "",
   ```
   - ❌ No validation that required values exist
   - ❌ Silently fails with empty strings
   - ❌ Should throw errors on startup

   **Fix:**
   ```typescript
   const required = (name: string) => {
     const val = process.env[name];
     if (!val) throw new Error(`${name} is required`);
     return val;
   };
   
   export const authleteConfig = {
     baseUrl: required('AUTHLETE_BASE_URL'),
     serviceId: required('AUTHLETE_SERVICE_ID'),
     AccessToken: required('AUTHLETE_BEARER_TOKEN'),
   };
   ```

3. **JWT Key Management**
   ```typescript
   // server/src/config/authlete.config.ts
   privateKey: process.env.JWT_PRIVATE_KEY_PEM || "",
   publicKey: process.env.JWT_PUBLIC_KEY_PEM || "",
   ```
   - ❌ Private keys in environment variables
   - ⚠️ Better than hardcoded, but not ideal
   - **Recommendation:** Use AWS Secrets Manager or HashiCorp Vault

### 3.2 Session Security - **Grade: B**

**✅ Good:**
```typescript
// server/src/middleware/session.ts
const defaultCookie: any = {
  httpOnly: true,           // ✅ Prevents XSS theft
  sameSite: "lax",          // ✅ CSRF protection
  secure: server.nodeEnv === "production",  // ✅ HTTPS only in prod
  maxAge: 1000 * 60 * 30,   // ✅ 30-minute expiry
};
```

**⚠️ Issues:**

1. **Session Secret Rotation**
   - No mechanism to rotate session secret
   - All sessions invalidated if secret changes
   - Should implement gradual rotation

2. **Session Storage**
   - Default in-memory storage (Express session)
   - Not scalable for multi-instance deployments
   - **Recommendation:** Use Redis or MongoDB for session store

3. **Session Data Not Encrypted**
   - Authorization ticket visible in session
   - User subject in plain text
   - **Fix:** Encrypt sensitive session fields

### 3.3 Input Validation - **Grade: D**

**🔴 MISSING:**

No input validation on:
- Authorization request parameters
- Token endpoint parameters
- UserInfo requests
- Introspection/Revocation requests

**Example - What's Missing:**
```typescript
// ❌ MISSING: No validation in authorization.service.ts
async process(req: Request): Promise<AuthorizationResponse> {
  const { context, ...reqBody }: AuthorizationRequest = req.query;
  // Should validate:
  // - client_id format
  // - redirect_uri format
  // - response_type values
  // - scope format
  // - state length (recommended 43+ chars)
  // - code_challenge format (43-128 chars)
}
```

**Implement:**
```typescript
import { z } from 'zod';

const authorizationParamSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  response_type: z.enum(['code', 'token', 'id_token']),
  scope: z.string().optional(),
  state: z.string().min(43).max(128),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  code_challenge_method: z.enum(['S256', 'plain']),
  nonce: z.string().optional(),
});

const validated = authorizationParamSchema.parse(req.query);
```

### 3.4 PKCE Implementation - **Grade: C+**

**✅ Good:**
- Code challenge captured and forwarded to Authlete
- SHA-256 method used correctly

**⚠️ Issues:**

1. **No Client-Side PKCE in UI**
   - Client should generate code_verifier and code_challenge
   - Currently relying on manual curl commands
   - **Fix:** Implement in client React app

2. **Plain PKCE Not Restricted**
   - Should disable `code_challenge_method=plain` for public clients
   - Only allow for highly trusted clients

### 3.5 CORS Configuration - **Grade: C**

**⚠️ Issue:**
```typescript
// server/src/app.ts - LINE 37
app.use(cors());  // Allows ALL origins
```

**Security Risk:**
- Any origin can make requests
- Enables CSRF attacks
- Violates OAuth2.0 security recommendations

**Fix:**
```typescript
import cors from 'cors';

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
```

### 3.6 Security Headers - **Grade: F**

**🔴 MISSING CRITICAL HEADERS:**

Add middleware for security headers:

```typescript
// server/src/middleware/securityHeaders.ts
import helmet from 'helmet';

export const securityHeadersMiddleware = () => {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // For development
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    frameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'strict-no-referrer' },
    xssFilter: true,
  });
};

// In app.ts:
app.use(securityHeadersMiddleware());
```

### 3.7 Error Handling - **Grade: B-**

**✅ Good:**
- Centralized error handler
- Different responses for HTML vs JSON
- Debug info conditionally shown

**⚠️ Issues:**

1. **Sensitive Data in Errors**
   ```typescript
   // server/src/middleware/errorHandler.ts
   res.status(status).json({
     error: "Internal Server Error",
     message,
     ...(isDevelopment && { stack: err?.stack }),
   });
   ```
   - ✅ Good conditionally showing stack trace
   - ⚠️ But `message` may contain sensitive info
   - Should have curated error messages

2. **Missing Error Codes**
   - Should return standardized error codes
   - Help clients identify specific issues

---

## 4. OpenID Connect Compliance - **Grade: B-**

### 4.1 Discovery Endpoint (`/.well-known/openid-configuration`)

**Expected Response Should Include:**
```json
{
  "issuer": "https://server.example.com",
  "authorization_endpoint": "https://server.example.com/api/authorization",
  "token_endpoint": "https://server.example.com/api/token",
  "userinfo_endpoint": "https://server.example.com/api/userinfo",
  "jwks_uri": "https://server.example.com/api/.well-known/jwks.json",
  "scopes_supported": ["openid", "profile", "email"],
  "response_types_supported": ["code", "id_token", "token"],
  "response_modes_supported": ["query", "fragment", "form_post"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "claim_types_supported": ["normal"],
  "claims_supported": ["sub", "name", "email", "email_verified"],
  "claim_parameters_supported": false,
  "userinfo_signing_alg_values_supported": ["none"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic"],
  "token_endpoint_auth_signing_alg_values_supported": ["RS256"],
  "revocation_endpoint": "https://server.example.com/api/revocation",
  "introspection_endpoint": "https://server.example.com/api/introspection",
  "registration_endpoint": "https://server.example.com/api/client/register",
  "end_session_endpoint": "https://server.example.com/api/logout"
}
```

**Current Status:** ⚠️ Need to verify endpoint implementation

### 4.2 ID Token Validation

**Missing:**
- `aud` (audience) claim validation
- `exp` (expiration) validation
- `iat` (issued at) validation
- `auth_time` claim

### 4.3 Logout Implementation

**Status:** ✅ Implemented (RP-initiated and backchannel)  
**Quality:** ⚠️ Should validate logout_token parameter

---

## 5. Missing OAuth2.0 Features

### 5.1 Refresh Token Rotation

**Status:** ⚠️ Not implemented
- Should rotate refresh tokens on each use
- Should invalidate old tokens
- Should track refresh token generations

### 5.2 Token Introspection for Expiry

**Status:** ⚠️ No client-side introspection validation
- Clients should introspect tokens before use
- Should check `active` and `exp` claims

### 5.3 Device Authorization Grant (RFC 8628)

**Status:** ❌ Not implemented
- Not critical for OAuth2.0 but useful for IoT

### 5.4 OAuth 2.0 for Browser-Based Apps (RFC 6819)

**Status:** ⚠️ Partially implemented
- Missing Authorization Code with PKCE for SPA
- Should use `implicit` grant (deprecated)

---

## 6. Production Readiness Assessment

### 6.1 Scalability - **Grade: C**

**Issues:**
- ❌ In-memory session storage (use Redis)
- ❌ Single Authlete instance (add connection pooling)
- ⚠️ No rate limiting
- ⚠️ No request queuing

### 6.2 Monitoring & Logging - **Grade: B**

**✅ Good:**
- Winston logger configured
- Request IDs for tracing
- Daily log rotation

**⚠️ Missing:**
- No metrics collection
- No health checks
- No distributed tracing
- No alerting setup

### 6.3 Testing - **Grade: F**

**Status:** ❌ No visible test suite

**Should Include:**
- Unit tests for each controller
- Integration tests with Authlete
- Security tests (CSRF, XSS, injection)
- OAuth2.0 compliance tests

### 6.4 Documentation - **Grade: B**

**✅ Good:**
- README with quick start
- Environment variable documentation
- Route examples

**⚠️ Missing:**
- API documentation (OpenAPI/Swagger)
- Architecture diagrams
- Security guidelines
- Deployment guide

---

## 7. Priority Action Items

### 🔴 CRITICAL (Fix Immediately)

1. **Configuration Security**
   ```bash
   - Remove hardcoded SESSION_SECRET default
   - Require AUTHLETE_* environment variables
   - Validate all config on startup
   ```

2. **Security Headers**
   ```bash
   - Install helmet: npm install helmet
   - Add CSP, X-Frame-Options, etc.
   - Set Strict-Transport-Security
   ```

3. **CORS Configuration**
   ```bash
   - Replace app.use(cors()) with explicit configuration
   - Whitelist allowed origins
   ```

4. **Input Validation**
   ```bash
   - Add Zod or Joi for schema validation
   - Validate all request parameters
   - Reject invalid/malicious input
   ```

5. **Session Storage**
   ```bash
   - Replace in-memory session storage with Redis
   - npm install connect-redis redis
   ```

### 🟡 HIGH (Within 1-2 weeks)

6. **Error Messages**
   - Sanitize error messages (don't expose internals)
   - Use standardized error codes

7. **Authlete Credentials**
   - Move from env variables to Secrets Manager
   - Implement secret rotation

8. **Refresh Token Rotation**
   - Implement automatic rotation
   - Track token chain

9. **PKCE Enforcement**
   - Disable plain method
   - Require for all public clients

10. **Test Suite**
    - Add Jest for unit tests
    - Add integration tests
    - Aim for 80%+ coverage

### 🟢 MEDIUM (Within 1 month)

11. **OpenID Connect**
    - Verify full spec compliance
    - Add missing claims to ID tokens
    - Implement claims request parameter

12. **Monitoring**
    - Add Prometheus metrics
    - Setup log aggregation (ELK/Splunk)
    - Configure alerting

13. **Documentation**
    - Create OpenAPI/Swagger docs
    - Add deployment guide
    - Security best practices guide

14. **Rate Limiting**
    - Implement Redis-based rate limiting
    - Protect authorization endpoint

15. **HTTPS Enforcement**
    - Enforce HTTPS in production
    - HTTP Strict Transport Security (HSTS)

---

## 8. Code Improvements

### 8.1 Configuration Module Refactor

```typescript
// server/src/config/validate.ts
import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production']).default('development'),
  port: z.number().int().positive().default(3000),
  sessionSecret: z.string().min(32),
  
  authleteBaseUrl: z.string().url(),
  authleteServiceId: z.string().min(1),
  authelateBearerToken: z.string().min(1),
  
  jwtIssuer: z.string().url(),
  jwtPrivateKeyPem: z.string(),
  jwtPublicKeyPem: z.string(),
});

type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  try {
    return configSchema.parse({
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
      sessionSecret: process.env.SESSION_SECRET,
      
      authleteBaseUrl: process.env.AUTHLETE_BASE_URL,
      authleteServiceId: process.env.AUTHLETE_SERVICE_ID,
      authelateBearerToken: process.env.AUTHLETE_BEARER_TOKEN,
      
      jwtIssuer: process.env.JWT_ISSUER,
      jwtPrivateKeyPem: process.env.JWT_PRIVATE_KEY_PEM,
      jwtPublicKeyPem: process.env.JWT_PUBLIC_KEY_PEM,
    });
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }
}

export const config = loadConfig();
```

### 8.2 Input Validation Middleware

```typescript
// server/src/middleware/validateRequest.ts
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const validateQuery = (schema: z.Schema) => 
  (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Invalid request parameters',
          details: error.errors,
        });
      }
      next(error);
    }
  };

export const validateBody = (schema: z.Schema) => 
  (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Invalid request body',
          details: error.errors,
        });
      }
      next(error);
    }
  };
```

### 8.3 Secure Headers Middleware

```typescript
// server/src/middleware/securityHeaders.ts
import { Request, Response, NextFunction } from 'express';

export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-no-referrer');
  
  // Permissions policy (formerly Feature Policy)
  res.setHeader('Permissions-Policy', 'accelerometer=(), microphone=(), camera=()');
  
  // Strict Transport Security
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
};
```

### 8.4 Rate Limiting Middleware

```typescript
// server/src/middleware/rateLimit.ts
import Redis from 'redis';
import { Request, Response, NextFunction } from 'express';

const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

export const rateLimit = (maxRequests: number, windowSeconds: number) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const key = `rate-limit:${req.ip}:${req.path}`;
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current).toString());
    
    if (current > maxRequests) {
      return res.status(429).json({
        error: 'too_many_requests',
        error_description: 'Rate limit exceeded',
      });
    }
    
    next();
  };
```

### 8.5 Authorization Service Refactor

```typescript
// server/src/services/authorization.service.ts
import { z } from 'zod';

const authorizationParamSchema = z.object({
  client_id: z.string().min(1).max(255),
  redirect_uri: z.string().url(),
  response_type: z.enum(['code', 'token', 'id_token']),
  scope: z.string().optional(),
  state: z.string().min(43).max(128),
  nonce: z.string().optional(),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  code_challenge_method: z.enum(['S256', 'plain']),
  prompt: z.enum(['none', 'login', 'consent', 'select_account']).optional(),
  max_age: z.number().int().positive().optional(),
  ui_locales: z.string().optional(),
  id_token_hint: z.string().optional(),
  login_hint: z.string().optional(),
});

export class AuthorizationService {
  async process(req: Request): Promise<AuthorizationResponse> {
    try {
      // Validate input
      const params = authorizationParamSchema.parse(req.query);
      
      // Log audit trail
      req.logger('Authorization request', {
        clientId: params.client_id,
        scopes: params.scope?.split(' '),
        redirectUri: params.redirect_uri,
      });
      
      // Build Authlete request
      const urlParams = new URLSearchParams(params as any);
      const response = await authleteApi.authorization.processRequest({
        serviceId,
        authorizationRequest: {
          parameters: urlParams.toString(),
        },
      });
      
      return response;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestError('Invalid authorization request parameters', error.errors);
      }
      throw error;
    }
  }
}
```

---

## 9. Environment Configuration Template

```bash
# .env.example

# ============================================================================
# Application Configuration
# ============================================================================
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
MORGAN_FORMAT=combined

# ============================================================================
# Session Configuration
# ============================================================================
# CRITICAL: Must be at least 32 random characters
SESSION_SECRET=your-super-secure-random-session-secret-min-32-chars-here

# ============================================================================
# Authlete Configuration
# ============================================================================
# These are REQUIRED - server will not start without them
AUTHLETE_BASE_URL=https://us.authlete.com
AUTHLETE_SERVICE_ID=your_service_id
AUTHLETE_BEARER_TOKEN=your_bearer_token

# ============================================================================
# JWT Configuration
# ============================================================================
# If using JWT tokens instead of reference tokens
JWT_ISSUER=https://your-server.example.com
JWT_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
JWT_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
JWKS_URI=https://your-server.example.com/api/.well-known/jwks.json

# ============================================================================
# Security Configuration
# ============================================================================
# CORS - Comma-separated list of allowed origins
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://yourapp.example.com

# Rate limiting
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX_REQUESTS=100

# ============================================================================
# Redis Configuration (for production session storage)
# ============================================================================
REDIS_URL=redis://localhost:6379

# ============================================================================
# Monitoring & Logging
# ============================================================================
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

---

## 10. Recommended Dependencies

```json
{
  "dependencies": {
    "@authlete/typescript-sdk": "^1.0.0",
    "express": "^4.18.0",
    "express-session": "^1.17.0",
    "connect-redis": "^6.1.0",
    "redis": "^4.5.0",
    "zod": "^3.20.0",
    "helmet": "^7.0.0",
    "cors": "^2.8.5",
    "winston": "^3.8.0",
    "winston-daily-rotate-file": "^5.0.0",
    "jsonwebtoken": "^9.0.0",
    "jwk-to-pem": "^2.0.7",
    "jwks-rsa": "^3.2.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.17",
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "supertest": "^6.3.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/parser": "^5.0.0",
    "@typescript-eslint/eslint-plugin": "^5.0.0"
  }
}
```

---

## 11. Security Testing Checklist

- [ ] OWASP Top 10 vulnerability scan
- [ ] Dependency vulnerability audit (`npm audit`)
- [ ] PKCE implementation validation
- [ ] State parameter validation
- [ ] CSRF token validation
- [ ] XSS protection verification
- [ ] SQLi/NoSQLi injection testing
- [ ] Authorization bypass attempts
- [ ] Token validation security
- [ ] Scope enforcement validation
- [ ] Rate limiting effectiveness
- [ ] Sensitive data exposure review
- [ ] SSL/TLS configuration audit

---

## 12. Deployment Checklist

- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] SSL/TLS certificate installed
- [ ] Redis cache configured
- [ ] Logging aggregation setup
- [ ] Monitoring and alerting enabled
- [ ] Backup strategy implemented
- [ ] Disaster recovery plan documented
- [ ] Security audit completed
- [ ] Load testing performed
- [ ] Documentation reviewed
- [ ] Team trained on operations

---

## 13. Compliance & Standards

**Current Compliance:**
- ✅ OAuth 2.0 (RFC 6749)
- ✅ OAuth 2.0 Authorization Code Grant (RFC 6749 Section 4.1)
- ✅ OpenID Connect Core (partial)
- ✅ Bearer Token Usage (RFC 6750)
- ✅ Token Introspection (RFC 7662)
- ✅ Token Revocation (RFC 7009)
- ⚠️ PKCE (RFC 7636) - Basic support
- ❌ OAuth 2.0 Security Best Practices (draft)

**Recommended Standards:**
- OAuth 2.0 Authorization Server Metadata (RFC 8414)
- OAuth 2.0 Proof Key for Public Clients (RFC 7636)
- JSON Web Token (JWT) (RFC 7519)
- OpenID Connect Discovery (1.0)

---

## 14. Contact & Support

For security vulnerabilities, please email: security@example.com

For general support: support@example.com

---

## Appendix A: Quick Fix Template

Create `server/src/config/validated-config.ts`:

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  // Application
  nodeEnv: z.enum(['development', 'production']).default('development'),
  port: z.number().int().min(1).max(65535).default(3000),
  
  // Authlete (required)
  authleteBaseUrl: z.string().url(),
  authleteServiceId: z.string().min(1),
  authleteBearerToken: z.string().min(1),
  
  // Session (required)
  sessionSecret: z.string().min(32),
  
  // Security
  allowedOrigins: z.string().default('http://localhost:3000'),
});

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

export const config = ConfigSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
  authleteBaseUrl: getEnv('AUTHLETE_BASE_URL'),
  authleteServiceId: getEnv('AUTHLETE_SERVICE_ID'),
  authleteBearerToken: getEnv('AUTHLETE_BEARER_TOKEN'),
  sessionSecret: getEnv('SESSION_SECRET'),
  allowedOrigins: process.env.ALLOWED_ORIGINS,
});
```

---

**Document Version:** 1.0  
**Last Updated:** June 2026  
**Next Review:** December 2026
