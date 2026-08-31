<!-- Loaded on demand, not by default. `AGENTS.md` is the obligation; this file is the explanation. -->

# Documentation style guide

> **Read this when** writing anything under `docs/`.

## Documentation style guide

All documentation in `docs/` follows a clear, highly visual, step-by-step, and beginner-friendly technical style. Keep the writing warm, clear, direct, and heavily focused on practical, step-by-step examples with clear diagrams or flow breakdowns. Maintain a neutral voice — do not reference external individuals, personal brands, or third-party authors in documentation, commit messages, or prompts.

**Structure:**
- "The short version" intro (1-2 sentence summary)
- Mermaid sequence/flow diagrams with dark theme
- Real-world analogies (airport, bank, hotel)
- "Why before how" — explain the problem before the solution
- "What just happened?" recaps after complex flows
- Common mistakes sections with red/green examples
- Troubleshooting tables at the end

**Tone:**
- Direct, conversational, no jargon without explanation
- Use "you" to address the reader
- Bold key terms on first use
- Tables for quick reference
- Code blocks with comments explaining each line

---

## Writing `AGENTS.md` and `docs/agents/` — the counter-example rule

The style above is for the tutorials. The agent docs are a different genre: they are rules, and the
question that decides what stays is **not** "is this history?" but **"is the wrong version still
tempting?"**

- **Cut narrative that records a closed sequence.** A fix that shipped, was reviewed and can no longer
  be reintroduced does not need its story retold. Cross-reference `audit/` and move on.
- **Keep the counter-example when someone could plausibly write the wrong thing again**, and keep it
  *attached to the rule it protects* — "X, not Y" beats "X" alone, because the reader who was about to
  write Y is the only reader who needed the line. Three that must survive any trim:
  `kid` vs `jkt`, `requestUri` vs `request_uri`, and prefix-matching a `post_logout_redirect_uri`.
- **Provenance is one parenthetical, not a paragraph** — `(fixed 2026-08-11; utils/verify-id-token-hint.ts)`
  and then the rule.

Measured 2026-08-31 across the eight area files: every dated clause that survives is a counter-example
of exactly this shape, and the imperative-to-date ratio runs 3:1 or better. **This rule lived in an
untracked scratch file at the repo root until it was promoted here** — where `AGENTS.md`'s router
actually points, so it is read rather than rediscovered.
