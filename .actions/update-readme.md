---
id: update-readme
name: Update README
description: Refresh README.md to match the current state of the project
icon: book
category: Documentation
---

Update the `README.md` at the repo root so it accurately describes the current state of the
project.

Work non-interactively: do not ask the user any question. If the project's purpose or audience
is not obvious, infer it from `package.json`, the source tree, and any existing documentation.

Steps:
- Read the current README if one exists, and skim the codebase structure to understand what
  the project actually does.
- Update or create sections for: a one-paragraph summary of what the project is, prerequisites
  (Node version, CLI tools, OS notes), install instructions, typical usage, and a brief
  contribution note.
- Preserve any existing badges, screenshots, or external links unless they are clearly stale.
- Keep the tone concise and practical — this is documentation for humans trying to use the
  project, not a marketing page.

Never touch `.claude/` or `.actions/`.
End your output with a short summary of what you changed in the README.
