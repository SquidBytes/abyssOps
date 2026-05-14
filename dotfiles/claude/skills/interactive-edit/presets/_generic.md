---
name: _generic
triggers: []
verifier:
---

# Generic preset (fallback)

Loaded when no other preset matches the task description.

## Buckets

Derive buckets from the task description at runtime. Aim for 2–5
buckets that group candidates by **the kind of decision being made**,
not by location in the file. Common decision axes:

- **Shape** — what data structure or signature is produced
  (e.g. "return type", "argument shape", "error envelope").
- **Behavior** — what runtime behavior the change implies
  (e.g. "fail loud vs. return default", "sync vs. async").
- **Scope** — how broadly the change applies
  (e.g. "all public methods" vs. "only the ones with `_internal`").

State each bucket in one sentence before running the questions so the
user can correct your grouping.

## Tradeoffs to surface

For each option in each bucket, the `description` field should answer
two questions:

1. **What changes in the file?** (Concrete, observable.)
2. **What changes for callers / tests / runtime?** (The ramification.)

If an option has a known downside, name it. Vague descriptions like
"safer" or "more correct" are not enough.

## Verifier

None. The generic preset does not run any post-apply check. If the
user wants verification, they can request it as part of the task
description ("...and run pytest after").

## Best practices

*A real preset should put canonical guidance for its topic here.* The
runbook draws on this section to mark a recommended option per bucket
and to add a short *why* phrase to that option's description.

Good content for this section:

- Which option among each bucket's choices is generally considered
  idiomatic, and one-sentence reason.
- Common pitfalls developers hit when making this kind of change.
- Style guide references the preset trusts (e.g. PEP 8, an official
  language doc, a project `CONTRIBUTING.md`).

If this section is empty, the skill presents options neutrally and
will say "the preset doesn't recommend a default here" if asked.

## Tone hints

*Topic-specific notes for the explanation style. Optional.* Use this
to record:

- Terms that should be glossed on first use, and the gloss to use.
- Analogies that work well for newcomers to this topic.
- Phrases or claims to avoid (because they are misleading or
  controversial).

The generic preset has no tone hints — Claude falls back on the
general rules in `SKILL.md § Explanation style`.
