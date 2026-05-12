---
pi_install:
  destination: ~/.pi/agent/skills/gsd-execute-phase/SKILL.md
  scope: global
  depends_on_plugins:
    - "@tintinweb/pi-subagents"
    - "@juicesharp/rpiv-todo"
    - "pi-rewind"
name: gsd-execute-phase
description: Execute a scoped phase plan with sub-agent orchestration. Main session reads the plan, dispatches each sub-plan to a fresh sub-agent, verifies output, and commits. Use after gsd-plan-phase has produced an approved PLAN.
---

# gsd-execute-phase

The main session is the orchestrator and verifier. Sub-agents do the focused implementation work in clean contexts.

## When to activate

- User says *execute phase N*, *implement phase N*, *start phase N*, *run plan…*.
- A `<NN>-PLAN.md` exists, has been reviewed, and the user has greenlit execution.

If the plan does not yet exist, fall back to `gsd-plan-phase`. If the user is reporting a bug rather than executing a planned phase, use `gsd-debug`.

## Pre-flight

Read `<project-root>/.pi/project.yaml`. From the manifest, resolve:
- `planning.root` — for STATE.md and phase directory paths.
- `repo.shape` and `repo.code_root` — to know where code commits land vs planning commits.
- `repo.push_gate` — never push if `agent_never`.
- `branching.main`, `branching.integration`, `branching.version_branch_pattern`, `branching.work_branch_pattern` — to validate the current branch.
- `commits` — passed to sub-agents so their commit messages comply.

Before dispatching any sub-agent:

1. Confirm `<planning.root>/STATE.md` reflects the right milestone and phase position. If not, update it.
2. Confirm you are on the correct branch:
   - Code changes go on a work branch matching `branching.work_branch_pattern`, cut from the current version branch.
   - For repos with `shape: nested` or `submodule`, planning / doc changes land on the parent repo's version branch directly. Code changes land inside `code_root`.
3. Confirm `pi-rewind` is active. The checkpoint history is your safety net if a sub-agent goes sideways.
4. Read `<NN>-PLAN.md` and any `<NN>-MM-PLAN.md` files. Build an internal wave plan: which sub-plans can run in parallel, which must sequence.

## Dispatch loop

For each sub-plan, in wave order:

### 1. Compose the sub-agent prompt

Each sub-agent gets:
- The sub-plan's text (verbatim).
- The list of files it is *allowed* to touch.
- The list of files / directories it is *forbidden* to touch (start with: anything outside the file list).
- The verification criteria from the plan.
- The commit message rules (`~/.pi/agent/rules/commit-messages.md`).
- The relevant project-specific commit rules from the manifest (`commits.forbidden_strings`, `commits.forbidden_patterns`, `commits.allowed_types`).
- For nested repos: which repo the commit lands in.

Do **not** forward the full conversation history. Sub-agents work better with tight, declarative input.

### 2. Wait for completion

Sub-agents return their diff, their commit message, and a self-reported verification result.

### 3. Verify in the main session

Before accepting the sub-agent's commit:

- Read the diff. Is the scope respected? Anything outside the allowed files?
- Run the project's targeted test command for the touched files (typically `pytest` / `vitest` / equivalent with a `-k` or pattern filter on the phase number).
- Lint the proposed commit message against the project's commit rules.
- Spot-check the verification criteria the sub-agent claims it met. Sub-agents lie about completeness.

If verification fails, return findings to the sub-agent for revision. Do not silently fix it in the main session — the sub-agent should learn the constraint.

### 4. Commit

Once verified, commit. Use the sub-agent's message if it passes the rules; rewrite minimally if not. Update the `todo` overlay to mark the must-have complete.

### 5. Update STATE.md after each wave

Keep STATE.md accurate after each sub-plan ships. Don't batch updates to the end — if the session dies, the next session needs to know where you stopped.

## Failure handling

- If a sub-agent fails twice on the same sub-plan, **stop the wave** and surface to the user. Do not keep retrying — the sub-plan is probably under-specified.
- If verification finds out-of-scope edits, propose a `pi-rewind` checkpoint restore and re-dispatch with tighter constraints.
- If two parallel sub-agents in a wave touch the same file, you scheduled them wrong. Re-sequence.

## End-of-phase

- All must-haves marked complete in `todo`.
- `<NN>-VERIFICATION.md` produced summarizing what shipped (per project convention).
- STATE.md updated to "Phase N complete" with the actual commit count.
- Surface "ready for milestone close" or "ready for next phase" to the user. Do not push.

## Hard nos

- No `git push` if `repo.push_gate` is `agent_never`.
- No sub-agent dispatch without a written plan as the input.
- No skipping verification because "it looks fine."
- No editing files outside the current sub-plan's allowed list.
