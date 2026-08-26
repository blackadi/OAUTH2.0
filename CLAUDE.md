@AGENTS.md

## Claude Code specifics

`AGENTS.md` above is the single source of truth for this repo and is shared with opencode. Do not
duplicate its content here, and do not create a competing set of instructions. If a project fact
changes, edit `AGENTS.md`, not this file.

> **This file used to break its own rule, in four places** (fixed 2026-08-23). The plan-mode gate, the
> `test:e2e` prohibition, the never-commit-credentials rule and the spec-citation rules were all stated
> here *and* in the `AGENTS.md` core — so the same obligation had two wordings that could drift, and the
> shorter one was not always the one being read. Three details existed **only** here and would have been
> lost by a plain delete: the examples of a semantics-free edit, the stop-mid-edit rider, and the
> proportionality note. Those moved **into** `AGENTS.md`'s plan-mode bullet rather than being dropped,
> because they apply to any agent working here and not only to Claude Code. What is left below is what
> is genuinely specific to this tool or is a stated preference of mine.

### How I want you to work

- **Stated uncertainty is more useful to me than confident prose.** When something is unverified, mark
  it `UNVERIFIED` inline *and* say so in your reply — do not quietly round it up to a claim.
  `AGENTS.md` requires the inline marker; the "and tell me" half is mine.
- **Tell me when a premise in my request turns out to be wrong**, and do the honest equivalent rather
  than the literal thing. Two examples from 2026-08-23, both of which saved work: "put the wizard step
  in URL state" — the wizards have no step state, they render every step at once, so a step is a
  `#fragment`; and "`prefers-reduced-motion` still needs doing" — it was already there.
- **Re-measure counts before quoting them.** Not a style preference: on 2026-08-23 the probed
  vendor-code figure was **25** in one document and **26** in another, and measured **27**. `AGENTS.md`
  says this about the check scripts; I mean it about every number in a sentence you write.
- **Corrections plainly and once.** If you got something wrong earlier in a session, say what the right
  answer is and move on. No tallying, no re-litigating.

### Documentation

Follow the documentation style guide already defined in `AGENTS.md` → `docs/agents/doc-style.md`. Do not
invent a second style.
