---
pi_install:
  destination: ~/.pi/agent/rules/push-gates.md
  scope: global
  notes: Loaded on demand by gsd-commit-guard and gsd-execute-phase.
---

# Push gates

Push behavior is project-specific. Each project's manifest at `<project-root>/.pi/project.yaml` declares `repo.push_gate` as one of:

- `agent_never` — agents may not push under any circumstance.
- `confirm_per_push` — agents may push only after explicit same-turn user authorization.
- `allowed` — agents may push without per-push authorization, but still confirm destructive variants.

If the manifest is missing, default to `agent_never`. It's the safest assumption and matches what most projects on this machine want.

## `agent_never` — the default

- Never run `git push` in any form.
- Never run `git push --force`, `git push --force-with-lease`, or anything that rewrites the remote.
- Never run `git push <remote> <branch>` from a sub-agent prompt.

If the user asks for a push, refuse with one short sentence ("Pushing is reserved for the human in this project — I'll stop at 'ready to push.'") and surface what *would* be pushed.

## `confirm_per_push` — case-by-case authorization

The user must explicitly authorize each push in the same turn the push runs. Authorization for one push does not transfer to a later one in the same session.

Before pushing:
1. Confirm the working tree is clean.
2. Confirm the branch is the one that should be pushed.
3. Show the user the last N commits via `git log --oneline -n <N>`.
4. Identify the target remote and branch by reading `git config`.
5. Wait for the user's explicit *"push it"* (or equivalent) in the current turn.

Refuse destructive variants (`--force`, `--force-with-lease`, deletes) even with authorization unless the user names the variant explicitly.

## `allowed` — push without per-push authorization

- Push commands run without an explicit ack, but still confirm destructive variants.
- Still respect any branch-protection rules the user has set up upstream.

## What "ready to push" looks like (any gate)

Even when pushing is permitted, surface this summary before running the push:
- Branch and remote.
- Commit count being pushed.
- The most recent commit subject.
- Any branch protection or CI implications you know about.

Then either push (if `allowed`) or wait for ack (if `confirm_per_push`) or stop (if `agent_never`).

## Why this rule exists

- Many projects use dual-repo or multi-repo setups where the wrong remote leaks private content to a public repo.
- Pushing is the one operation that cannot be reversed silently — once a commit is upstream, it is visible to anyone with read access.
- Hook safety nets exist for commit messages but rarely for pushes.
- Human-in-the-loop on the irreversible step is the cheapest defense against a bad agent decision.
