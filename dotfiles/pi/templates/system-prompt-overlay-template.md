---
pi_install:
  destination: <project-root>/.pi/AGENTS.md
  scope: project
  notes: |
    Project-local AGENTS.md. Pi loads this on top of the global AGENTS.md
    when sessions run inside this project's tree. The `gsd-install-project`
    skill normally generates this file from your answers — edit the result
    by hand only if the installer's output needs adjustment.
---

# <Project name> overlay

<One paragraph: what is this project, and why does Pi need special instructions for it that the global setup doesn't cover? Examples: multi-repo shape, strict commit format, push gates, language conventions, framework idioms.>

This overlay is generated and read alongside the project manifest at `<project-root>/.pi/project.yaml`. Numeric and structural data (paths, commit patterns, push gate, etc.) lives in the manifest; this file is for prose context that doesn't fit cleanly into YAML.

## Repo shape

<Describe the layout. If `repo.shape` is `mono`, this section can be short or omitted. If `nested` / `submodule` / `multi`, draw the boundary clearly — show where each kind of change should land.>

| Repo / area | Path | Remote | Content |
|---|---|---|---|
| <e.g. Application> | `<path>` | `<remote>` | <what lives here> |

## Hard rules

<Strict rules Pi must follow without exception. The "hard" framing matters — if a rule has carve-outs, put it under a different heading.>

- <e.g. "No pushes." Cross-reference manifest: `repo.push_gate: agent_never`.>
- <e.g. "No <secret category> in committed files." Cross-reference `pii.categories` and `rules/pii-policy.md`.>
- <e.g. "Never reference `<internal-path-prefix>/` in content committed to the public repo." Cross-reference manifest: `commits.forbidden_strings`.>

## Commits in this project

<If the project has rules beyond the manifest's `commits.*` block (e.g. "always include a footer with the ticket URL"), state them here. Otherwise reference the manifest and move on.>

Format and structural rules: see `~/.pi/agent/rules/commit-messages.md` + the manifest's `commits.*` block.

## Branching

<Branching strategy summary. The actual patterns live in the manifest's `branching.*` block; this section is the prose narrative — who merges to `main`, what's protected, when to cut a release branch.>

- <e.g. "Work branches cut from `dev`, merge back to `dev` via PR. `main` is release-only.">
- <e.g. "Human owns all merges to `main` and `dev`.">

## Versioning

<If the project uses a non-default versioning scheme, document it here.>

## Tooling / MCP routing

<If this project exposes MCP servers, mention how to pick which (the manifest's `mcp.databases` lists them with their roles). If there are language-specific tools Pi should default to, name them.>

If a request doesn't specify, ask before picking.

## Related project memory

<Where does Pi's per-project memory live? Note any stale memories that should be ignored.>

---

## Authoring notes (delete before installing)

- The `gsd-install-project` skill generates this file from your manifest answers. Hand-edit it only if a section needs language the installer can't infer.
- Keep this file *project-specific*. Anything that would also apply to other projects belongs in `~/.pi/agent/AGENTS.md` (composed from `base.md` + `gsd-overlay.md`) instead.
- Cross-reference the manifest rather than restating its values. Manifest values drift; if this file restates them, the two will diverge.
- Don't restate the global rules. The point of layering is to add the *delta* between general defaults and what this project needs.
