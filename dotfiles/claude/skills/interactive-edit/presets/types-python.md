---
name: types-python
triggers:
  - mypy
  - ty
  - pyright
  - type annotation
  - type annotations
  - type hint
  - type hints
  - typing
  - add types
verifier_candidates:
  - mypy {file}
  - ty check {file}
  - pyright {file}
---

# Python type annotations (mypy / ty / pyright)

Use when the task is adding or tightening Python type annotations. The
categorization is the same regardless of which checker the user runs;
only the verifier command differs.

## Bucket templates

Pick the ones that have at least 2 candidates after analysis. Skip the
rest. Order matters — ask earlier buckets first because later answers
often depend on them.

### 1. Return types

Group candidates by the *shape* of what the function returns:

- Functions that always return one type → ask: explicit type vs.
  `TypeAlias` (if used in many places).
- Functions that may return `None` → ask: `Optional[X]` vs. always
  return `X` and raise on the missing case vs. return a sentinel.
- Functions returning containers → ask: `list[X]` vs. `Sequence[X]`
  vs. `Iterable[X]` (each has different caller contracts).
- Functions returning unions → ask: keep `Union` vs. split into two
  functions vs. use `overload`.

### 2. Parameter types

Group by parameter kind:

- Builtins (str, int, bool, float) — usually mechanical, can be one
  question with `multiSelect` over "annotate all" / "skip private" /
  "skip test files".
- Custom classes — ask: import the concrete class vs. use a
  `Protocol` (decouples callers).
- Callables — ask: `Callable[..., X]` vs. a typed `Protocol` with
  `__call__` vs. leave loose.
- Optional defaults (`def f(x=None)`) — ask: `Optional[X]` vs. require
  the caller to pass something.

### 3. Optional / None handling

If the file has functions that *could* return None but currently
return missing values implicitly, this is its own decision because it
changes runtime behavior, not just annotations. Options:

- Return `Optional[X]` and let callers handle `None`.
- Raise an exception (specify which) on the missing case.
- Return an explicit sentinel value (specify which).

Surface that **callers will need to change** under the first two
options.

### 4. Generics & TypeVars

If the file has functions that pass values through unchanged, ask
whether to use `TypeVar` to preserve the type. Options:

- Add `TypeVar` to preserve the input type.
- Use `Any` and accept loss of type information.
- Constrain with `bound=` if all callsites use a known base class.

### 5. Class attributes

If classes have unannotated attributes, ask:

- Annotate in `__init__` only.
- Annotate at class level (becomes part of the public API).
- Use `dataclass` / `attrs` instead (bigger change — flag this).

## Verifier

Pick the first command from `verifier_candidates` whose tool is
available on the user's PATH. Test with `which mypy` / `which ty` /
`which pyright`. If none are installed, skip verification and say so
in the final summary.

Run the verifier against each modified file individually, not the
whole project — keep failures scoped to what this run changed.

## Notes

- If the file already has `from __future__ import annotations`, all
  annotations are strings at runtime; this widens what is safe to
  annotate without import cycles.
- If the file uses `typing.TYPE_CHECKING`, prefer adding imports there
  for type-only references.
- `list[X]` / `dict[X, Y]` builtin generics require Python 3.9+. If
  the project's `pyproject.toml` / `setup.py` targets older, fall back
  to `typing.List` / `typing.Dict` and note it in the plan.

## Best practices

Broadly-accepted defaults for Python type annotations (PEP 484, PEP
604, and the mypy / ty / pyright community style):

- **Be explicit at boundaries, loose internally.** Public functions and
  class methods should have full annotations. Small private helpers
  can be less strict if they make the public surface clearer.
- **Pick the narrowest precise type the caller needs.** `Iterable[X]`
  is friendlier than `list[X]` if the caller only iterates. Don't
  over-promise.
- **`Optional[X]` is a contract, not a workaround.** Once you write
  it, every caller is now obligated to handle `None`. Use it when
  "missing" is a normal outcome. If `None` means "this should never
  happen", **raise** instead — it surfaces the bug.
- **`Any` is the escape hatch.** Use sparingly and leave a comment.
  Prefer `object` when you mean "anything, I won't touch it" — that
  is type-safe and forces narrowing at the call site.
- **`from __future__ import annotations`** at the top of a file
  defers all annotation evaluation to runtime. Use on Python 3.9+ to
  allow forward references without `TYPE_CHECKING` gymnastics.
- **Builtin generics over `typing.List` / `typing.Dict`** on Python
  3.9+. `list[int]` is the modern form; the `typing.List[int]` form
  is legacy and kept only for older versions.
- **`Protocol` decouples.** When a parameter just needs "something
  with a `.read()` method", a `Protocol` is more reusable than the
  concrete class. Helpful when the file imports from many places.
- **`TypeVar` preserves identity.** If a function returns whatever
  type it was given, use a `TypeVar` — `Any` would erase that.

Decision tree for **Optional / None**:

- Absence is a normal, expected outcome → `Optional[X]`.
- Absence indicates a bug or unreachable state → raise (`ValueError`,
  `LookupError`, or a domain-specific exception).
- Absence is part of the data model with meaning → a sentinel like
  `_MISSING` (rare; document why).

## Tone hints

When explaining type annotations to someone still learning:

- **Gloss on first use** in any option description:
  - `Optional[X]` → "X or None"
  - `Union[A, B]` → "either A or B"
  - `TypeVar` → "a placeholder that says 'remember whatever type came
    in and reuse it'"
  - `Protocol` → "a duck-typed interface — any class with these
    methods counts"
  - `Any` → "type checker disabled for this value"
  - `Callable[..., X]` → "any function that returns X"
- **Concrete examples over abstract syntax.** Prefer "returns a
  `dict` like `{'id': 1, 'name': 'Alice'}`" to "returns
  `dict[str, Any]`".
- **Name the runtime impact** when the choice changes behavior, not
  just typing. "This changes what your code *does*, not only what the
  checker sees" is more informative than "this is stricter".
- **Avoid type theory vocabulary** (covariant, invariant, monad)
  unless it actually changes the decision being made.
- **Don't claim `Any` is 'wrong'.** It is a deliberate tool. Frame it
  as "you're telling the checker to look the other way here — fine if
  intentional, risky if accidental."
