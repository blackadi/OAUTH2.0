# Exams

**The short version:** four cumulative exams that test what the module quizzes structurally cannot — whether
you can combine mechanisms from *different* modules when nobody tells you which module the answer is in.

| Exam | Take it after | Covers | Items | Points | Suggested time |
|---|---|---|---|---|---|
| **[Exam A](exam-a.md)** | Module 03 | 00–03: web, JOSE, delegation, core flow, PKCE | 15 | 100 | 90 min |
| **[Exam B](exam-b.md)** | Module 07 | 00–07, weighted to 04–07: lifecycle, integrity, machine grants, the audit method | 15 | 100 | 2 hours |
| **[Exam C](exam-c.md)** | Module 11 | 08–11: OIDC, extensions, credentials, FAPI, API security | 15 | 100 | 2 hours |
| **[Final](final-exam.md)** | Module 11, before the capstone | Everything | 12 | 100 | 2–3 hours |

## How these differ from the module quizzes

A module quiz asks *did you understand this module?* An exam asks *can you use it?* Concretely:

- **Every exam has integrative items** that require two or more modules at once. Those are the ones worth
  the most marks, and they are the reason the exams exist.
- **Fewer multiple-choice items, more tracing and design.** MCQs are efficient for recall and poor at
  detecting the difference between "I remember the term" and "I can apply it."
- **Answer keys point back at modules rather than re-teaching.** A missed item is a signal about where to
  return, so each answer names the module and section that covers it. That is the output of an exam — not
  the score.

## Rules

**Closed book.** No modules, no specs, no notes, no searching. That is the point: the definition of done in
the [curriculum README](../README.md#what-youll-be-able-to-do-at-the-end) says *without reference material*,
and an open-book exam measures your ability to grep.

Two exceptions, because they measure typing rather than understanding: you may use `curl`, and for any item
marked **`[lab]`** you may use the running server and the curriculum scripts.

**Timeboxed.** The suggested times are generous. If you run over badly, that is data — recall that slow is
recall that will not be there in a design review.

**Write your answers down** before checking anything. An answer you composed in your head while reading the
key is not an answer.

## Scoring

Each exam is out of 100 with per-item marks shown. Grade yourself against the answer key, then:

| Score | Reading |
|---|---|
| **85+** | Proceed. |
| **70–84** | Proceed, but redo the modules behind your misses first — the next block builds on them. |
| **55–69** | Do not proceed yet. Re-read the weak modules and retake in a few days. |
| **< 55** | Re-work the modules and their labs. The labs are where the retention comes from. |

**Grade harshly on the free-response items.** The rubric for each says what full marks requires; if your
answer is missing a required element, it does not have full marks even if what is there is correct. The
failure mode this guards against is the one Module 12's rubric names too: generosity on exactly the criteria
that distinguish understanding from familiarity.

## A note on why these were written last

These four exams were **backfilled in Stage 4**, after all fourteen modules were complete, rather than as each
came due. That was a deliberate choice by the repo owner, and it had one clear benefit: an exam written after
the whole curriculum exists can draw on material the earlier module quizzes could not have known about. Exam A
in particular reaches forward in a way it could not have if written after Module 03 — several of its items
are framed the way Module 07 taught you to frame things.

Where an exam depends on something taught *later* than the module it follows, it says so inline and the item
is optional. There are three such items and each is marked.
