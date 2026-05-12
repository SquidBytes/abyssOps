---
pi_install:
  destination: ~/.pi/agent/skills/<your-skill-name>/SKILL.md
  scope: global                 # or "project" for ~/Documents/projects/<project>/.pi/skills/...
  depends_on_plugins:           # optional — list any Pi packages this skill assumes are installed
    - "@example/some-package"
name: <your-skill-name>         # short kebab-case, matches the directory name
description: <one sentence describing what this skill does AND when to use it. The "when" half is what triggers auto-loading — be specific about the user phrases or repo states that should activate it.>
---

# <Skill display name>

<One paragraph: what problem does this solve? Why is a skill the right shape for it (vs. a rule, an extension, or a system-prompt addition)?>

## When to activate

- <Concrete user phrase that triggers it.>
- <Repository state that should trigger it (e.g. "a new `.planning/phases/<NN>-*` directory exists").>
- <Anything else that should reliably auto-load this skill.>

If <some condition>, defer to <other-skill-name> instead — keep skill responsibilities non-overlapping.

## Pre-flight

- <Files this skill should read before acting.>
- <Rules it loads from `~/.pi/agent/rules/` if any.>
- <Plugins it depends on being installed and configured.>

## Behavior

### 1. <First step name>

<What the skill does. Be concrete: which tool calls, which files, which decisions.>

### 2. <Second step>

<Same level of detail. Note any user-confirmation gates explicitly.>

### 3. <Third step>

<...>

## Hard nos

- <Things this skill must never do — usually file edits outside its scope, dispatching sub-agents prematurely, running `git push`, bypassing verification.>
- <One per line. Keep this list short and absolute.>

## Output shape

What "this skill ran successfully" means in observable terms:
- <Files written / updated.>
- <State recorded.>
- <Hand-off to which other skill, if any.>

---

## Authoring notes (delete before installing)

- Skills are auto-loaded based on the `description` field's relevance to the current conversation. Make the description specific to triggers, not vague.
- Skills are persuasion, not enforcement. If you need a hard block on a tool call, the right primitive is a hook or an extension (e.g. `@tianhai/pi-workflow-kit` for plan-mode hard blocks).
- Keep skill bodies tight — Pi reads them into the active context every time they trigger. ~80–120 lines is usually right; anything longer should probably be split or moved to a `rules/` file the skill references.
- Reference rules with their full installed path (`~/.pi/agent/rules/<name>.md`) so Pi knows to load them on demand.
- If you reference another skill, use its `name:` value, not the file path.
