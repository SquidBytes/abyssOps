---
pi_install:
  destination: ~/.pi/agent/rules/planning-directory.md
  scope: global
  notes: Reference fragment loaded on demand by GSD-aware skills.
---

# Planning directory shape (GSD)

Skills detect a GSD-shaped project by reading the manifest at `<project-root>/.pi/project.yaml`. Use this file to know what artifacts live where once the manifest tells you the planning root.

## Manifest-driven paths

All planning paths derive from `planning.root` in the manifest. Typical values: `.planning/`, `docs/plans/`, `planning/`, or `null` (project does not use a GSD-style workflow).

If `planning.root` is null, every skill in this set should short-circuit gracefully — surface "this project isn't configured for phase-style planning; run `gsd-install-project` if that's wrong" and stop.

## Common artifact layout

Once `<planning.root>` is resolved, expect:

| Path (relative to planning.root) | Purpose |
|---|---|
| `STATE.md` | Source of truth for current milestone, current phase, progress counts. Read first on session start. |
| `PROJECT.md` | Long-lived project reference: core value, decisions log, retrospective links. Read only when STATE refers to it or the user asks about decisions. |
| `ROADMAP.md` | Milestone sequence and high-level phase ordering. Read when adding new phases or reasoning about milestone close. |
| `MILESTONES.md` | Milestone-level summaries. |
| `CONVENTIONS.md` | Project-specific conventions (commit format, plan-doc shape). Authoritative for anything format-related. |
| `phases/<NN>-<slug>/` | Per-phase directory. Contents vary by phase state — see below. |
| `sketches/` | UI / layout sketches produced before phases that touch the frontend. |
| `research/` | Long-form research artifacts referenced by phase plans. |
| `intel/` | Domain knowledge that survives across phases. |
| `quick/` | Quick-task work items that don't warrant a full phase. |
| `seeds/` | Pre-promotion ideas for phases not yet on the roadmap. |
| `spikes/` | Time-boxed exploration work. |
| `ui-reviews/` | UI audit reports tied to specific phases. |
| `HANDOFF.json` | Machine-readable session-to-session handoff. |

A given project may use a subset of these. Skills should detect presence before reading.

## Phase state taxonomy

Each phase directory's state determines what work is legal against it.

| State | Detect by presence of | Placement allowed? |
|---|---|---|
| **SHIPPED** | `<NN>-VERIFICATION.md` and/or `<NN>-SUMMARY.md`; phase appears under completed list in ROADMAP. | No new work. Only a `.M` decimal sub-phase if direct gap closure. |
| **PLAN-READY** | `<NN>-PLAN.md` present, no `<NN>-VERIFICATION.md`. | Yes — fold during `gsd-plan-phase` revisit, before `gsd-execute-phase` runs. |
| **PRE-PLAN** | `<NN>-CONTEXT.md` plus `<NN>-DISCUSSION-LOG.md` or `<NN>-RESEARCH.md`, no PLAN. | Yes — fold during `gsd-plan-phase`. |
| **PRE-DISCUSS** | Only `<NN>-CONTEXT.md` (or stub). | Yes — fold during `gsd-discuss-phase`. |
| **STAGED / BACKLOG** | Lives in `staging/` or `backlog/` with decimal numbering (`999.x`). | Treat as PRE-DISCUSS. |
| **PROPOSED** | Number reserved in the working-notes file but no directory exists. | New scope is fine; promote via the project's add-phase workflow when ready. |

Detection should be cheap — directory listing + filename presence checks. Don't read phase files just to classify state.

## Sub-phase notation

- `NN-MM-*` (e.g. `34-02-PLAN.md`) — a sub-plan within phase `NN`. Multiple sub-plans per phase.
- `NN.M-*` (e.g. `28.1-foo/`) — a decimal sub-phase, used for direct gap closure against a SHIPPED parent phase. Different from a sub-plan; lives in its own directory.

## Working notes location

Resolved from `planning.working_notes` in the manifest. Common values: `dev/notes/WORKING.md`, `WORKING.md`, `docs/working.md`. The file is free-form input from the user between sessions; the `note-marker` skill (`/marknotes`) classifies items in it.
