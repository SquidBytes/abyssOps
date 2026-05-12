---
pi_install:
  destination: ~/.pi/agent/AGENTS.md
  scope: global
  compose: append-after base.md
  notes: |
    Second half of the global AGENTS.md. Activates GSD-aware behavior when
    a project carries a `.pi/project.yaml` manifest with a non-null
    `planning.root`.
---

# GSD project awareness

Activate the behavior below whenever the current working directory (or any ancestor up to `$HOME`) contains `.pi/project.yaml`. If that file is absent, treat this section as inactive and fall back to the base behavior.

## On session start

1. Read `<project-root>/.pi/project.yaml`. Cache:
   - `planning.root` — null means GSD is not active for this project; stop here.
   - `planning.working_notes` — for the working-notes review skill.
   - `repo.shape`, `repo.code_root`, `repo.push_gate` — for commits and pushes.
   - `commits.*` — for commit-message linting.
2. Read `<planning.root>/STATE.md` for the current milestone, position, and any deferred items.
3. Read `<planning.root>/PROJECT.md` only if STATE refers to it or the user asks about decisions.
4. Surface the current phase, plan, and any "blocked on" items in one sentence to the user. Don't pre-emptively offer to act.

## When the user names a phase number

Default to **discussion mode** unless the user explicitly says *execute*, *implement*, *code*, *fix*, or *run*. In discussion mode:

- Read the phase directory (`<planning.root>/phases/<NN>-*/`) before answering.
- Surface ambiguities as a structured question via `ask_user_question` rather than guessing.
- Make no file edits and run no migrations until the user confirms a path forward.

The full discussion loop is in the `gsd-discuss-phase` skill — invoke or follow it when the conversation enters phase scoping.

## When the user reports a bug or unexpected behavior

Default to the `gsd-debug` skill's triage flow: form 1–3 hypotheses, decide trivial / targeted / wide, and stop to confirm hypothesis ranking before spending sub-agent budget.

## Commits

- Read `~/.pi/agent/rules/commit-messages.md` for the baseline rules and the manifest's `commits.*` block for project-specific overrides before composing any commit subject.
- Respect `repo.push_gate`. When `agent_never`, never run `git push`; stop at "ready to push" and surface what would be pushed.

## Working notes

- When the user dumps thoughts into the project's working-notes file (path in `planning.working_notes`) or invokes `/marknotes`, run the `note-marker` skill. It calls Node scripts to preprocess the file into a compact payload, classifies each unreviewed item, and writes back STATUS lines — do not read the working file directly yourself.

## Sub-agent dispatch

When using `pi-subagents`:
- Pass each sub-agent a tight, task-scoped context: the specific files it needs, the symptom or scope description, and the one decision it needs to return. Do not forward the entire conversation.
- Always run a verification pass in the main session before committing sub-agent output. Sub-agents can hallucinate; the verifier exists to catch it.

## Bootstrapping a fresh project

If the user is inside a project tree without `.pi/project.yaml`, suggest running the `gsd-install-project` skill before invoking any other GSD skill. The installer asks the project-shape questions once and produces the manifest plus project-local AGENTS.md and PII rules.
