---
id: generate-tests
name: Generate Tests
description: Generate unit tests for the source files that lack coverage
icon: beaker
category: Testing
---

Generate unit tests for source files in this project that currently have no test coverage.

Work non-interactively: do not ask the user any question. If the test framework is not obvious,
infer it from `package.json`, the repository's existing test files, or any configuration found
in the repo.

Scope:
- Inspect the source tree and identify files with meaningful logic that lack a corresponding
  test file (e.g. `foo.ts` with no `foo.test.ts` or `foo.spec.ts` nearby).
- Pick a small batch (2-3 files at most) that benefit most from tests — pure logic first,
  glue/wiring last.
- Write tests that exercise the public surface of each file, cover at least the happy path
  and the obvious edge cases, and stay close to the repo's existing testing style.

Never touch `.claude/` or `.actions/`.
Never run destructive shell commands.
End your output with a short summary of which files you added tests for and which cases each
test covers.
