# Module 12 — Capstone

> **The short version:** two deliverables. **Design** a high-assurance multi-tenant authorization
> architecture and defend every choice against a named attacker model. Then **review** a deliberately
> vulnerable implementation of the same brief and find what is wrong with it. Nobody grades this but you, so
> the rubric is written to make self-deception difficult.

## Prerequisites

Modules 00 through 11, all of them, with Tier 4 passed on each. This is the only module that assumes
everything.

---

## How this module is different

Every previous module taught you a mechanism and the attack it stops. This one teaches nothing new. It asks
whether you can *use* what you have when nobody tells you which module the answer is in — which is the only
condition that ever actually occurs.

Two things change:

1. **There are no right answers, only defensible ones.** A design is graded on whether the reasoning holds,
   not on whether it matches mine. Several choices in the brief below have two good answers and one bad one,
   and the interesting work is saying why you rejected the other good one.
2. **You will be wrong about something, and the rubric is built to surface it.** The review half has a fixed
   number of planted defects. If you find eight of twenty-five and grade yourself "pretty good", the rubric
   will disagree with you, in writing.

> **On the exams.** The learning path schedules cumulative exams after Modules 03, 07 and 11 and a final exam
> before this one. **Those are not written yet** — they are Stage 4 work (see
> [PROGRESS.md](../../PROGRESS.md)). Do the capstone now; the exams will slot in behind it as extra practice,
> not as a prerequisite. Module 07's Tier 4 was written to stand in for Exam B in the meantime.

---

## The two deliverables

### Part A — Design

Given the brief in [lab.md](lab.md), produce an architecture document that makes and defends **nine
decisions**. Roughly 1,500–3,000 words. Every decision needs: what you chose, what you rejected, and **which
attacker capability the choice defeats**.

The nine:

| # | Decision |
|---|---|
| 1 | Grant type and client authentication, per client type |
| 2 | Token format and lifetime, per API tier |
| 3 | Sender-constraining: which mechanism, or none, per client type |
| 4 | Request and response integrity: PAR, JAR, JARM — which, and why not the others |
| 5 | How authorization is expressed: scopes, claims, RAR — and what each is *not* used for |
| 6 | Multi-tenancy and object-level authorization: where enforced, and how it cannot be forgotten |
| 7 | Consent lifecycle: grant, withdrawal, and the guaranteed window until access stops |
| 8 | Service-to-service: how a downstream service knows on whose authority it is acting |
| 9 | Key management and what your telemetry would and would not catch |

### Part B — Adversarial review

[lab.md](lab.md) contains **Meridian Health** — a complete, plausible architecture document for the *same
brief*, written the way real ones are written, with defects planted throughout. Produce a findings report in
the Module 07 format: statement, evidence, severity as strength × reachability, remediation, and a defended
remediation order.

**There are exactly 25 planted defects.** You are told the number because otherwise "I found them all" is
unfalsifiable. You are not told where they are or which modules they come from — and a few passages describe
things done **correctly**, so discrimination counts.

---

## The rubric

Grade Part A on reasoning and Part B on coverage. Be harsh; the alternative is finding out later.

### Part A — design (45 points)

| Criterion | Points | What full marks looks like |
|---|---:|---|
| **All nine decisions made explicitly** | 9 | One per decision. A decision you did not notice you were making scores zero. |
| **Rejected alternatives named** | 9 | For each decision, what else was viable and why you did not pick it. "It's less secure" without a threat is half marks. |
| **Attacker model stated and used** | 8 | You name the attacker capabilities you defend against (FAPI 2.0's six are a fine starting point) **and what is out of scope**. Module 10. |
| **Threat → control traceability** | 8 | Every control traces to an attacker capability; every capability has a control or an accepted risk. Unmatched entries in either direction cost marks. |
| **Object-level authorization addressed structurally** | 6 | Not "we check ownership" but a design in which forgetting is hard. Module 11. |
| **Honest limitations section** | 5 | What your design does *not* protect against, and what you would need to change if the threat model shifted. An absent limitations section scores zero, however good the rest is. |

### Part B — review (45 points)

| Criterion | Points | |
|---|---:|---|
| **Defects found** | 20 | Score `round(found / 25 × 20)`. |
| **Correct severity** | 10 | Strength × reachability, not modal verb. Over-ranking costs the same as under-ranking. |
| **Correct attribution** | 5 | Which layer owns each — design, implementation, configuration, or upstream. State unverified attributions as unverified (Module 11). |
| **Remediation order defended** | 10 | Not spec order and not hardest-first. Justify by attackers disarmed per unit of effort (Module 10's lab). |

### Cross-cutting (10 points)

| Criterion | Points | |
|---|---:|---|
| **Spec citations correct** | 5 | Right identifier, right status, no drafts cited as normative. Wrong citations cost marks even when the conclusion is right. |
| **No false positives** | 5 | Findings you cannot evidence cost marks. Deduct 1 per confidently-asserted claim you cannot support. |

**Total: 100.**

| Score | Reading |
|---|---|
| **85+** | You can do this work. Go and do it. |
| **70–84** | Solid. Re-read the modules behind whatever you missed and redo Part B. |
| **55–69** | The mechanisms are there and the judgement is not yet. Redo Part A after Modules 07 and 10. |
| **< 55** | Work back through the Tier 4 questions before retrying. |

> **The single most common way to overscore yourself** is generosity on *rejected alternatives* and
> *limitations*. Those two criteria are 14 points and they are what separates an architecture document from a
> list of technologies. If you cannot name what you rejected, you did not make a decision — you followed a
> default.

---

## How to grade yourself honestly

1. **Write Part A completely before reading the Meridian document.** Otherwise you will design around defects
   you have already been shown, and you will learn nothing about your own blind spots.
2. **Write Part B completely before opening [quiz-answers.md](quiz-answers.md).** Timebox it. When you stop
   finding defects, stop — then count.
3. **Score before you read the model answer.** Then read it and score again. The gap between the two is the
   thing worth knowing.
4. **Keep the list of what you missed.** Each miss points at a module. That list, not the score, is the
   output of this exercise.

**Expect 4–8 hours.** Part B is the longer half if you do it properly.

---

## Then answer the review questions

**[→ quiz.md](quiz.md)** — 18 items across the usual four tiers, all drawn from the capstone. Tier 4 is
where you defend your own design rather than critique someone else's, and it is the last gate in the
curriculum.

---

## What this measures against the definition of done

The [curriculum README](../../README.md) says a finisher can, without reference material:

| Definition of done | Where the capstone tests it |
|---|---|
| Draw the code+PKCE flow at wire level, naming every parameter | Part A decisions 1 and 4; quiz Tier 1 |
| Explain why an access token does not authenticate a user | Meridian has this defect; Part B |
| Choose grants, client auth and binding for an arbitrary architecture and defend each against a **named** attacker model | Part A, decisions 1–3, and the attacker-model criterion |
| Place an unfamiliar extension in the dependency graph | quiz Tier 2 |
| Find the authorization flaw in a code review | Part B; several defects are in code |
| Pass Tier 4 of every quiz | quiz Tier 4 here is the last one |

If you can do all six, you are done — and the more useful outcome is that you now know which of the six you
are weakest at.

---

## After the capstone

Three things worth doing, in descending order of value:

1. **Fix the findings in this repo.** Fourteen real defects were surfaced across Modules 04–11 and
   deliberately left unfixed, and they are catalogued in [PROGRESS.md](../../PROGRESS.md). Two are serious.
   Fixing them with tests is the most realistic exercise available here, and unlike the capstone it produces
   something that matters.
2. **Run a conformance suite** against a real deployment, remembering Module 11's caveat about what it cannot
   see.
3. **Re-read Module 10's attacker-model section** in a year. It is the piece that transfers furthest beyond
   OAuth.

---

## Onward

There is no Module 13. Go and review something real — and when someone tells you their system is secure,
ask them what their attacker model is and what it leaves out.
