---
pi_install:
  destination: ~/.pi/agent/rules/<your-rule-name>.md
  scope: global                 # or "project" for ~/Documents/projects/<project>/.pi/rules/...
  notes: <one line about when this rule gets loaded — usually "Loaded on demand by <skill-A>, <skill-B>".>
---

# <Rule title>

<One sentence stating what this rule covers. Rules are loaded by skills on demand; keep them factual and scannable, not motivational.>

## <Section: the rule itself>

- <The actual rule, stated declaratively.>
- <If there are multiple sub-rules, one per line.>
- <Tables work well here when the rule is conditional on context. Bulleted lists work when it's a flat policy.>

## Examples

| Verdict | Case |
|---|---|
| Good | <Concrete example of compliant behavior.> |
| Good | <Another, ideally covering a different edge.> |
| Bad | <Concrete example of non-compliant behavior, with the reason in italics.> |
| Bad | <Another.> |

## Edge cases / exceptions

- <If the rule has carve-outs, list them here with the condition that activates each.>
- <If there are no exceptions, write "No exceptions." explicitly — silence implies wiggle room and skills will exploit it.>

## Enforcement

<How is this rule enforced? Soft (skill linting), medium (hook), hard (extension blocking the tool call), human (out-of-band review). Be honest — agents need to know whether they can rely on a backstop.>

---

## Authoring notes (delete before installing)

- Rules live in `rules/` because they're factual and reusable across skills. If a rule applies to only one skill, embed it in the skill body instead.
- Don't write rules in motivational prose ("we strive to..."). Write them as constraints ("never X", "always Y", "X iff Y").
- When a rule references a project's canonical source (e.g. `.planning/CONVENTIONS.md`), say so explicitly and date the mirror. Mirrors drift; flagging the canonical location lets future-you catch the drift.
- If the rule is project-specific (like PII policy), install it project-locally rather than globally. Use the `scope: project` line above and adjust the destination.
