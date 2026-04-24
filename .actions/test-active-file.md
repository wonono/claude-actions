---
id: test-active-file
name: Test Active File
description: Run a quick test analysis on the currently focused file
icon: beaker
category: Debug
parameters:
  - kind: text
    key: file
    name: File path
    description: The file to test (defaults to the currently active editor)
    placeholder: src/example.ts
    defaultFrom: activeFile
---

Analyze and test the file at `{{file}}`.

Run non-interactively — never prompt for input. Inspect the file, identify its
purpose, and perform a lightweight validation: check for syntax issues, obvious
bugs, missing imports, and inconsistencies with surrounding code. If the file
contains functions or classes, verify that their signatures and return types look
correct.

Do not modify `.claude/` or `.actions/`. Do not create or delete any files.

End with a short summary of findings: what looks good, and what (if anything)
needs attention.
