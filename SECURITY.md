# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| main    | :white_check_mark: |

Only the `main` branch receives security updates. Deploy from a pinned commit or tag for production use.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Use [GitHub Security Advisories](https://github.com/blackadi/OAUTH2.0/security/advisories/new) to report vulnerabilities privately. This ensures the issue is visible only to maintainers until a fix is available.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

| Action | Target |
|--------|--------|
| Acknowledgment | 48 hours |
| Triage & assessment | 5 business days |
| Fix or mitigation | 30 days for critical/high, 90 days for medium/low |
| Public disclosure | After fix is released |

## Scope

### In Scope

- Authentication and authorization bypass
- Token forgery or injection
- Session hijacking
- CSRF attacks on state-changing endpoints
- Injection attacks (SQL, NoSQL, command, header)
- Sensitive data exposure through API responses
- Rate limiting bypass

### Out of Scope

- Authlete cloud API vulnerabilities (report to [Authlete](https://support.authlete.com))
- Denial of service attacks
- Social engineering
- Issues in dependencies (report upstream, then we'll update)

## Security Best Practices for Deployment

- Use HTTPS in production (configure reverse proxy with TLS)
- Set strong `SESSION_SECRET` (32+ random bytes)
- Enable Redis for session persistence (`REDIS_URL`)
- Set `NODE_ENV=production` (suppresses error stacks, enables HSTS)
- Configure `ALLOWED_ORIGINS` for your domain
- Set `MGMT_CLIENT_ID` / `MGMT_CLIENT_SECRET` for admin endpoints
- Keep dependencies updated (`npm audit`, Dependabot)
