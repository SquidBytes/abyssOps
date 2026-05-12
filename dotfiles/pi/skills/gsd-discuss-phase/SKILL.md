---
pi_install:
  destination: ~/.pi/agent/skills/gsd-discuss-phase/SKILL.md
  scope: global
  depends_on_plugins:
    - "@juicesharp/rpiv-ask-user-question"
name: gsd-discuss-phase
description: Scope and clarify a planned phase before any planning or execution. Use whenever the user names a phase number ("phase 36", "discuss phase X", "let's scope...") and edits have not yet been authorized.
---

# gsd-discuss-phase

Pi's bias is to act. This skill flips that bias for the duration of a phase-scoping conversation: ask first, edit nothing.

## When to activate

- User says *discuss*, *scope*, *talk through*, *plan out* + a phase identifier.
- User references a phase number without specifying an action verb.
- A new phase directory exists and the user is asking about it.

If the user says *execute*, *implement*, *code*, *fix*, or *run* a phase, exit this skill and follow `gsd-plan-phase` or `gsd-execute-phase` instead.

## Pre-flight

Read the project manifest at `<project-root>/.pi/project.yaml`:
- If missing, prompt the user to run `gsd-install-project` and exit.
- If `planning.root` is `null`, tell the user this project isn't configured for GSD-style phases and exit.

From the manifest, resolve:
- `planning.root` — typically `.planning/`
- The phase directory lives at `<planning.root>/phases/<NN>-*/`.

## Behavior

### 1. Locate the phase

- List `<planning.root>/phases/` and identify the directory matching the user's phase reference.
- Read in this order, stopping when you have enough to ask intelligent questions:
  1. `<NN>-CONTEXT.md` (always — this is the brief)
  2. `<NN>-DISCUSSION-LOG.md` (if it exists — prior session's open items)
  3. `<NN>-RESEARCH.md` (if it exists — pre-baked findings)
- Cross-reference `<planning.root>/STATE.md` to know the current milestone and whether this phase is PRE-DISCUSS / PRE-PLAN / PLAN-READY / SHIPPED. See `~/.pi/agent/rules/planning-directory.md` for the state taxonomy.

If the phase directory does not exist but the number appears as a reservation in `<planning.working_notes>`, it is a PROPOSED phase. Note that and treat the working-notes entry as the brief.

### 2. Form questions, do not guess

Surface every ambiguity in CONTEXT (and any unresolved items in DISCUSSION-LOG) as a single batched `ask_user_question` call. Group up to 4 questions per call. Prefer:
- Multi-select for "which of these are in scope?"
- Single-select with `Other` for "which approach feels right?"
- Per-option `preview` fields when the choice involves a code or layout decision.

Reserve free-form questions for cases where typed options would mislead.

### 3. Wait

After firing the question dialog, **stop**. Do not pre-fill files, do not draft a plan, do not start a sub-agent. Resume only after the user answers.

### 4. Synthesize

When answers come back, restate the scoped decisions in one short block (5–10 lines), and ask whether to:
- Update `<NN>-CONTEXT.md` and remain in discussion (more open questions).
- Promote to `gsd-plan-phase` (ready to write the plan).
- Pause (user wants to think).

Updates to `<NN>-CONTEXT.md` should be additive and minimal — add resolved decisions under a `## Resolved during discussion` section, not rewrite existing prose.

## Hard nos

- No edits to source files during discussion.
- No edits to `<NN>-PLAN.md` — that file is owned by `gsd-plan-phase`.
- No invocation of sub-agents — discussion is conversational by design; sub-agents cost context and obscure the decision trail.
- No new files outside `<planning.root>/phases/<NN>-*/` and `<planning.root>/STATE.md`.

## Output shape

The skill is "successful" when one of these is true:
- User confirmed the phase is ready for `gsd-plan-phase`.
- User asked to pause and resume later (record open questions back to `<NN>-CONTEXT.md`).
- User abandoned the phase (note in CONTEXT and update STATE if appropriate).
