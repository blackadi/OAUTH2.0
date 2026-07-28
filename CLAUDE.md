@AGENTS.md

## Claude Code specifics

`AGENTS.md` above is the single source of truth for this repo and is shared with opencode. Do not
duplicate its content here, and do not create a competing set of instructions. If a project fact
changes, edit `AGENTS.md`, not this file.

### Working style

- Use plan mode for changes under `server/src/controllers/`, `server/src/services/`, and anything
  touching client authentication, token issuance, or DPoP proof validation.
- Run `npm --prefix server run typecheck && npm --prefix server run lint && npm --prefix server run test`
  before proposing a commit. All three must be clean.
- Do not run `npm --prefix server run test:e2e` unless I ask — it consumes real Authlete API quota
  and trips the ~15-call rate limit.
- Never commit `.env` files or real Authlete credentials, tokens, or client secrets. Redact them in
  logs, docs, and examples.

### Specification accuracy

This repo teaches OAuth and OIDC, so a wrong citation propagates into other people's mental models.

- Verify every spec identifier — number, exact title, status, date — against the primary source
  before citing it in code comments or docs. Do not cite from recall.
- Label each reference as: published RFC, active Internet-Draft (with revision and date consulted),
  OpenID Foundation final, OpenID implementer's draft, or vendor-specific behavior.
- Mark anything unverified inline as `UNVERIFIED` and tell me. Stated uncertainty is more useful to
  me than confident prose.
- Distinguish Authlete implementation behavior from normative spec requirements whenever both are in
  play. That gap is where real deployments break.

### Documentation

Follow the documentation style guide already defined in `AGENTS.md`. Do not invent a second style.
