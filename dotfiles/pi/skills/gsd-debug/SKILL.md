---
pi_install:
  destination: ~/.pi/agent/skills/gsd-debug/SKILL.md
  scope: global
  depends_on_plugins:
    - "@tintinweb/pi-subagents"
    - "@juicesharp/rpiv-ask-user-question"
    - "pi-rewind"
name: gsd-debug
description: Triage a bug or unexpected behavior, dispatch a research sub-agent if needed, propose a fix, confirm with user, then dispatch a fix sub-agent and verify. Use when the user says something isn't working, reports a regression, or asks "why is X happening?".
---

# gsd-debug

A scoped debugging loop: triage → confirm → research → confirm → fix → verify. The user gates every transition between phases. Sub-agents work in tight context windows; the main session orchestrates.

## When to activate

- User says *X isn't working*, *Y is broken*, *this is wrong*, *unexpected*, *regression*.
- User asks *why is …*, *where is … coming from*, *what's setting…*.

If the issue is clearly tied to an in-progress phase plan, prefer `gsd-execute-phase`'s verification loop instead — debug is for *unplanned* failures.

## Pre-flight

Read `<project-root>/.pi/project.yaml` if present. From the manifest, resolve `planning.root` (used to read STATE.md for current-phase context) and `repo.push_gate` (used by the eventual commit step). If no manifest exists, the skill still works — just skip the GSD-state lookup and treat the project as a generic codebase.

## Phase 1 — Triage (main session, no edits, no sub-agents)

1. Read `<planning.root>/STATE.md` if available to know current phase and recent commits.
2. Locate the symptom surface: which route, template, query, ingestion path, migration. Cap initial reading at ~5 files.
3. Form 1–3 hypotheses, each tagged `high` / `medium` / `low` confidence.
4. Categorize the work needed:
   - **Trivial** — clear one-line fix in the main session. Skip to Phase 4.
   - **Targeted** — one fix sub-agent, no research needed. Skip Phase 2.
   - **Wide** — research sub-agent first, then a fix sub-agent.
5. Stop. Present hypotheses + categorization to the user via `ask_user_question`. Do not proceed without explicit confirmation.

## Phase 2 — Research sub-agent (only on user confirm)

Dispatch a sub-agent with:
- The symptom description (verbatim from the user).
- The hypothesis you're testing.
- 3–5 files to investigate.
- Instruction: return root cause, proposed fix, affected files, and what test would have caught this.

Do *not* forward the broader conversation. Research sub-agents waste tokens on context they don't need.

The sub-agent returns findings. Read them; do not blindly trust them.

## Phase 3 — User gates the fix

Present root cause + proposed fix + affected files to the user. Ask: go / refine / abort. Use `ask_user_question` with three options.

If "refine," return to Phase 2 with the refinement as additional input.

## Phase 4 — Fix sub-agent (only on go)

Dispatch with:
- Root cause description.
- Proposed fix (specific files and lines if known).
- Allowed-files list.
- Forbidden-files list (everything outside allowed).
- Commit message rules (`~/.pi/agent/rules/commit-messages.md` + project-specific overrides from the manifest).

Sub-agent returns diff + proposed commit message + claimed verification.

## Phase 5 — Main-session verification

Mandatory before commit:

- Read the diff. Was scope respected?
- Run targeted tests against the touched files.
- Manually re-check the symptom: does the original failure case now behave correctly?
- Lint the commit message against the project's rules.

If anything fails, return findings to the fix sub-agent for revision. Do not silently fix in the main session — keep the loop honest.

## Phase 6 — Commit

Once verified, commit and update STATE.md if the fix relates to a tracked phase or known regression. Surface to the user; do not push (`repo.push_gate` is `agent_never` in most projects — respect it).

If the fix is a regression against a recently-shipped phase, propose adding it as a `.M` decimal sub-phase against that parent. Do not commit the decimal sub-phase without user agreement.

## Hard nos

- No edits in Phase 1 — triage is read-only.
- No commit without Phase 5 verification.
- No push unless `repo.push_gate` explicitly allows it (rare).
- No fix attempts beyond 2 cycles on the same sub-agent without surfacing to the user — the bug is probably under-characterized.
