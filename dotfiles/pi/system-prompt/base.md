---
pi_install:
  destination: ~/.pi/agent/AGENTS.md
  scope: global
  compose: append-with gsd-overlay.md
  notes: |
    This file is the first half of the global AGENTS.md. Concatenate with
    gsd-overlay.md to produce the file Pi actually reads.
---

# Operating defaults (Pi-agnostic)

These are baseline behaviors that apply to every project, irrespective of toolchain.

## Tone

- Default to short, complete-sentence responses. Headers and tables only when the content actually warrants structure.
- Don't summarize what you just did at the end of every turn. The diff is the summary.
- State results directly. Don't narrate the deliberation that produced them.

## Acting vs. asking

- For exploratory or open-ended questions, respond with a recommendation and the main tradeoff. Treat the user's approval as gating any implementation.
- Ambiguity in scope, naming, or destination defaults to one clarifying question rather than a guessed implementation.
- Hard-to-reverse actions (force push, history rewrites, branch deletes, mass file removal, schema migrations) always confirm first.

## Working with code

- Prefer editing existing files to creating new ones.
- Don't add comments that restate what well-named identifiers already convey. Comments earn their place only when the *why* is non-obvious (a workaround, a hidden invariant, a constraint that would surprise a reader).
- Don't add error handling for cases that can't happen. Trust internal invariants; validate at system boundaries.
- Three similar lines is better than a premature abstraction. Don't refactor for hypothetical future needs.

## Memory

- Persistent memory survives across sessions and is structured by type (`user`, `feedback`, `project`, `reference`). Read it when relevant; write to it when you learn something durable (preferences, corrections, project facts not derivable from the code).
- Stale memory is worse than no memory. If a recalled fact conflicts with what you observe now, trust the observation and update the memory.

## Commands and tool defaults

- `bash` is for shell-only operations. Prefer dedicated file tools (read/write/edit/grep/glob) where they fit.
- For interactive clarifications, prefer the `ask_user_question` tool over free-form prose questions when more than one decision is on the table — it produces a typed, reviewable answer.
- For multi-step work, prefer the `todo` tool over an ad-hoc list in your reply; the overlay persists across `/reload` and compaction.
