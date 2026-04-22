# claude-actions — project context

VS Code extension that exposes a sidebar of versioned "actions" — markdown files describing a prompt — runnable in the background via the `claude` CLI. An action = one click = `claude -p --dangerously-skip-permissions` with the prompt piped via stdin, wrapped in a system prompt that enforces non-interactivity and folder safety. Actions are created by Claude itself through a guided flow and land as markdown files in `.actions/`, so a team can share and version them like any other code artifact.

## Key contracts

### Action file format (`.actions/*.md`)

```markdown
---
id: kebab-case-matching-filename
name: Short Title Case Name
description: One sentence under 120 chars
icon: codicon-id (e.g. wrench, beaker, rocket, zap)
---

<Prompt body, in English.>
```

Rules:
- `id` is the stable key. Renaming a file ≠ changing identity as long as `id` stays constant.
- The markdown **body** (post-frontmatter) is the raw prompt that gets inserted into the system-prompt wrapper.
- **Actions are always written in English**, regardless of the project's primary language. This is enforced by the creation system prompt and is non-negotiable — it keeps actions portable across teams and avoids localization drift.

### Prompt composition

Every `claude` invocation goes through a system prompt wrapper stored in `src/claude/prompts/`. Two wrappers:
- `RUN_SYSTEM_PROMPT` — wraps a user action's body when it's executed.
- `CREATE_SYSTEM_PROMPT` — wraps the user's description when they create a new action via the `+` button.

Both wrappers enforce the same invariants: non-interactive (never ask questions), never touch `.claude/` or `.actions/`, stay inside the workspace, no gratuitous destructive shell commands. Composition is a literal `replace('{placeholder}', body)` — no templating engine.

### Claude CLI invocation

Always: `child_process.spawn('claude', ['-p', '--dangerously-skip-permissions'], { stdio: ['pipe', 'pipe', 'pipe'], cwd: workspaceRoot })`, then `child.stdin.write(composed); child.stdin.end()`. The prompt travels via **stdin, never argv** — argv would break on quoting and `ARG_MAX` for long bodies.

Exit cleanup lives in a single `exit` handler: remove from the id→ChildProcess Map, clear any SIGKILL escalation timer, emit state change, fire the completion notification. Never duplicate cleanup logic in the kill path.

### First-time trust

`claude` asks for a one-shot folder-trust approval the first time it runs in a directory. `--dangerously-skip-permissions` does **not** bypass this (bypasses per-tool permissions only). Mitigation: the `claude-actions.initWorkspace` command opens a **visible** terminal running `claude`, lets the user approve, then they close it. Exposed in the welcome view and offered automatically by the failure notification when `src/util/trustError.ts` detects a trust-related stderr pattern.

## Module responsibilities

| Path | Owns |
|---|---|
| `src/extension.ts` | Activation, command registration, `context.subscriptions`. |
| `src/actions/ActionStore.ts` | Disk scan of `.actions/`, frontmatter parse, change events. |
| `src/actions/ActionModel.ts` | `Action` type, frontmatter validation. |
| `src/actions/ActionRunner.ts` | id→ChildProcess Map, state transitions, concurrency. |
| `src/actions/PinStore.ts` | Per-user pin state backed by `workspaceState`, change events. |
| `src/claude/spawnClaude.ts` | Single wrapper around `child_process.spawn` (stdin-based). |
| `src/claude/prompts/runTemplate.ts` | `RUN_SYSTEM_PROMPT`. |
| `src/claude/prompts/createTemplate.ts` | `CREATE_SYSTEM_PROMPT`. |
| `src/views/ActionsTreeProvider.ts` | Read-only view onto Store+Runner state. Never mutates. |
| `src/commands/*.ts` | One file per command. |
| `src/util/workspace.ts` | Workspace root resolution, `.actions/` path & bootstrap. |
| `src/util/log.ts` | OutputChannel factory: 1 global + 1 per running action. |
| `src/util/trustError.ts` | stderr pattern matcher for folder-trust failures. |
| `src/util/claudeVersion.ts` | `claude --version` + npm registry lookup, 1h cache, emits update-available events. |
| `hooks/post-edit-build.sh` | Auto-bump + build + vsix install + old-vsix cleanup. |
| `.claude/settings.json` | PostToolUse hook wiring. |

## Non-obvious rules

- **`.actions/` is a hidden folder** (dot prefix). Some file dialogs hide it by default — this is intentional to avoid clutter at the repo root.
- **Tree state has one owner per concern.** ActionStore = what's on disk. ActionRunner = what's running. PinStore = what's pinned. The tree provider is a view that subscribes to all three — never mutate state from the view.
- **Dispose everything.** OutputChannels, FileSystemWatchers, EventEmitters, child processes: push to `context.subscriptions` at activation or the extension host leaks across reloads.
- **Error paths funnel through the logger.** Global "Claude Actions" OutputChannel for traces + `showErrorMessage` for the user. For anything unexpected, do both — one for the user now, one for future-you debugging an issue report.
- **Progress throttling = 500 ms.** The per-action tree subitem (last stdout line + uptime) refreshes at most every 500 ms via a simple `setTimeout` + dirty flag. VS Code tree refreshes are not free.
- **Claude CLI version matters.** Flags `-p`, `--dangerously-skip-permissions`, `--output-format stream-json` evolved across versions. README pins the minimum tested version; extension startup runs `claude --version` and warns if too old.
- **Pins are personal, not shared.** `PinStore` is backed by `context.workspaceState` — per-user, per-workspace. Pinning is never written to disk and never ends up in git. Two teammates can pin different actions without stepping on each other.
- **Sort order: pinned alpha, then unpinned alpha.** The sidebar always reflects this. Starting or stopping an action does not reorder — only pin/unpin does. This keeps the sidebar stable during an active session.
- **Update flow is user-initiated, never silent.** The `$(cloud-download)` button only appears when a newer CLI version exists AND no action is currently running. Update runs in a **visible** terminal so non-dev users can see progress and errors. While `claude-actions.updating` is true, run/create/update are all disabled — don't try to bypass this from a new command.
- **Context keys are the UI gating mechanism.** `claude-actions.noActions`, `claude-actions.anyRunning`, `claude-actions.updating`, `claude-actions.updateAvailable` drive both welcome views and toolbar/inline button visibility. Set them via `vscode.commands.executeCommand('setContext', key, value)` and be religious about keeping them in sync with real state — a drift between the context key and the underlying state is the class of bug that takes an hour to diagnose.

## Language & style

- Extension code: strict TypeScript, no `any` without a one-line justification. Prefer `vscode.Uri.joinPath` over string concatenation.
- Prompts (`src/claude/prompts/*`): English only.
- Action files (`.actions/*.md`): English only.
- Everything else (inline comments, internal docs): match the contributor's language, default English for new content.
