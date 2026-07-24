# Contributing to Authlete Node.js Authorization Server

Thanks for your interest in contributing! This guide explains how to get started.

## Prerequisites

- **Node.js 22+** (check with `node --version`)
- **npm** (comes with Node)
- **Docker** (optional, for Redis, Prometheus, Grafana)
- **Authlete account** (free tier works — [sign up](https://console.authlete.com))

## Setup

```bash
# Clone the repo
git clone https://github.com/blackadi/OAUTH2.0.git
cd OAUTH2.0

# Install dependencies
npm --prefix server install && npm --prefix client install

# Configure environment
cp server/.env.example server/.env
cp client/.env.example client/.env

# Add your Authlete credentials to server/.env
# Required: AUTHLETE_BEARER_TOKEN, AUTHLETE_BASE_URL, AUTHLETE_SERVICE_ID, SESSION_SECRET

# Start dev servers
npm --prefix server run dev    # Express on :3000
npm --prefix client run dev    # SPA on :3001
```

## Development Workflow

### Branch Naming

Use descriptive prefixes:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feat/` | New feature | `feat/add-saml-support` |
| `fix/` | Bug fix | `fix/csrf-token-missing` |
| `docs/` | Documentation only | `docs/update-api-ref` |
| `refactor/` | Code restructuring | `refactor/token-controller` |
| `test/` | Adding/updating tests | `test/add-rar-unit-tests` |
| `chore/` | Tooling, CI, deps | `chore/update-dependencies` |

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add SAML 2.0 federation endpoint

- Implement SAML metadata endpoint
- Add XML signature validation
- Closes #123
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`

### Before Submitting a PR

Run the full check suite:

```bash
# Server
npm --prefix server run lint         # ESLint (0 errors)
npm --prefix server run typecheck    # TypeScript (0 errors)
npm --prefix server run test         # All tests (287 unit + 31 integration)

# Client
npm --prefix client run build        # Vite production build
npm --prefix client run test         # Client tests
```

All checks must pass before requesting review.

## Pull Request Process

1. **Fork** the repo (or create a branch if you have write access)
2. **Create a feature branch** from `main`
3. **Make your changes** following the code conventions below
4. **Add/update tests** for new functionality
5. **Update documentation** if adding features or changing behavior
6. **Run the full check suite** (see above)
7. **Open a PR** against `main` with a clear description

### PR Description

Include:
- What changed and why
- Link to related issue (e.g., `Closes #42`)
- Screenshots for UI changes
- Testing steps for reviewers

### Code Review

- All PRs require at least one review
- Address feedback with additional commits (don't force-push during review)
- Maintainers may squash-merge to keep history clean

## Code Conventions

### Server (`server/src/`)

- **TypeScript strict mode** — no `any` types unless absolutely necessary
- **Functional with explicit types** — prefer functions over classes
- **Express patterns** — use `(req, res, next)` signature, never `app.use` in route files
- **Error handling** — throw `AppError` (from `utils/app-error.ts`), not raw `Error`
- **Logging** — use `const log = req.logger || logger;` pattern
- **No secrets in code** — all credentials come from env vars
- **Authlete SDK** — all OAuth logic via SDK, no raw `fetch()` to Authlete (except health, backchannel-logout, metrics)

### Client (`client/src/`)

- **React functional components** with hooks
- **Tailwind CSS v4** for styling (no inline styles)
- **TypeScript interfaces** for all props and state
- **Services** for API calls (in `services/` directory)
- **No hardcoded URLs** — use `config.ts` helpers

### Testing

- **Vitest** for both server and client
- **Supertest** for HTTP integration tests
- **Mock Authlete SDK** in unit tests (`vi.mock()`)
- **Test file location**: mirror source structure (`src/services/foo.ts` → `tests/unit/services/foo.test.ts`)
- **Naming**: `*.test.ts` for unit, `routes.test.ts` for integration

## Documentation

- **Tutorials** in `docs/` follow Aaron Parecki's teaching style:
  - "The short version" intro
  - Mermaid sequence/flow diagrams
  - Real-world analogies
  - "Why before how" structure
  - Common mistakes sections
  - Troubleshooting tables
- **API reference** in `docs/API.md` — add new endpoints there
- **Architecture** in `docs/ARCHITECTURE.md` — update for structural changes

## Issue Guidelines

### Bug Reports

Use the bug report template. Include:
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Node version, browser)
- Relevant logs or error messages

### Feature Requests

Use the feature request template. Include:
- Problem you're trying to solve
- Proposed solution
- Alternatives you considered

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md). Be respectful and inclusive.

## Questions?

- **Documentation**: Check `docs/` directory
- **Issues**: Use the issue templates
- **Security**: See [SECURITY.md](SECURITY.md)
