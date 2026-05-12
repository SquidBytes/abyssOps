---
pi_install:
  destination: ~/.pi/agent/skills/gsd-plan-phase/SKILL.md
  scope: global
  depends_on_plugins:
    - "@juicesharp/rpiv-ask-user-question"
    - "@juicesharp/rpiv-todo"
    - "@tintinweb/pi-subagents"
name: gsd-plan-phase
description: Turn a scoped phase context into a structured plan. Use after gsd-discuss-phase has produced a confirmed CONTEXT. Recommends whether UI-spec, research, or domain-expert input is needed before execution.
---

# gsd-plan-phase

Read the scoped context, produce a plan, and decide whether the phase is ready to execute or needs an upstream artifact first.

## When to activate

- `gsd-discuss-phase` resolved with "ready to plan."
- User says *plan phase N*, *write the plan*, *what's the plan for…*.
- A phase directory has a CONTEXT but no PLAN, and the user wants to move forward.

## Pre-flight

Read `<project-root>/.pi/project.yaml`:
- If missing or `planning.root` is null, ask the user to run `gsd-install-project` first and exit.
- Otherwise resolve `<planning.root>` for the rest of this skill.

## Behavior

### 1. Read the inputs

- `<planning.root>/phases/<NN>-*/<NN>-CONTEXT.md` — scoped brief.
- `<planning.root>/CONVENTIONS.md` (if present) — plan format and section structure for this project.
- Adjacent shipped phases — patterns and precedents (`<NN-1>-SUMMARY.md`, sibling `<NN>-MM-SUMMARY.md` files).

### 2. Assess prerequisites

Before drafting plan content, evaluate three branches via a single `ask_user_question` call:

- **UI spec needed?** Trigger when CONTEXT touches templates, page layouts, visual hierarchy, design tokens, or component behavior. If yes, recommend producing or updating a UI sketch in `<planning.root>/sketches/` (or the project's equivalent) before planning detail proceeds.
- **Research needed?** Trigger when CONTEXT touches third-party APIs, unfamiliar libraries, migration patterns the project hasn't used, or numeric thresholds whose values aren't yet picked. If yes, recommend a `<NN>-RESEARCH.md` artifact first.
- **Domain consult needed?** Trigger when CONTEXT touches a domain where wrong defaults silently produce wrong output downstream and the project has saved domain notes. If yes, recommend pulling in saved notes (`<planning.root>/intel/`, `<planning.root>/research/`) before sub-plans are written.

Present these as a multi-select; the user marks which (if any) apply.

### 3. Branch

- If the user picks any branch, **stop planning** and surface what work the precursor artifact needs. Don't try to half-write the plan around a missing spec.
- If the user picks none, proceed to draft.

### 4. Draft `<NN>-PLAN.md`

Follow the project's plan template (typically): goal, scope/non-scope, sub-plans (`<NN>-01-PLAN.md`, `<NN>-02-PLAN.md`, …) with file lists, must-haves, and verification criteria. Match the structure of the most recent shipped phase in this project, not an idealized template.

Mirror each sub-plan's must-haves into a `todo` overlay entry so execution tracking has somewhere to live.

### 5. Verify the plan with the user

Before writing PLAN to disk, present the draft inline and ask:
- Is the scope correct?
- Are the sub-plans the right granularity (too coarse / too fine)?
- Is anything missing?

Iterate until the user approves. Then write.

## Hard nos

- No source edits during planning.
- No sub-agent dispatch from this skill — sub-agents belong to `gsd-execute-phase`.
- Don't write the plan to disk before the user has eyeballed at least one full pass.

## Output shape

- `<NN>-PLAN.md` and any `<NN>-MM-PLAN.md` sub-plans written.
- `todo` overlay seeded with the plan's must-haves.
- `<planning.root>/STATE.md` updated to reflect "Plan ready" position.
