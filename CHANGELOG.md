# Changelog

All notable changes to the Claude Actions extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-22

Initial public release.

### Added
- **Sidebar view** (`⚡` activity-bar icon) listing all actions discovered in `.actions/` at the workspace root.
- **Action file format** — markdown with YAML frontmatter (`id`, `name`, `description`, `icon`, optional `parameter`), body = prompt.
- **One-click run** — background `claude -p --dangerously-skip-permissions` execution, prompt piped via stdin, fully non-interactive.
- **Per-action output channel** — opens on demand via the progress sub-item or the completion notification.
- **Live progress sub-item** — last non-empty stdout line + uptime, auto-expanded when the action is running, throttled to 500 ms to avoid flicker.
- **Parallel execution** — multiple actions can run simultaneously, each with its own channel and state.
- **Cancel button** (× icon) — `SIGTERM`, escalates to `SIGKILL` after 2 s.
- **Completion notification** — success or error, with a *Show output* button.
- **Pin / unpin** — per-user, per-workspace preference (backed by `workspaceState`, never committed). Pinned actions are sorted alphabetically above the rest under their own section when both groups exist.
- **Category headers** (*Pinned* / *Actions*) with icons, shown only when both groups are populated. Actions are indented under their category.
- **Create flow** (`+` toolbar button) — InputBox for a free-text description, Claude writes the `.actions/<slug>.md` file itself under a dedicated system prompt with cancellation support via the progress notification.
- **Parameter support** — an action can declare one parameter:
  - `kind: pick` — QuickPick with filter-as-you-type, single or multi-select (`multiple: true` for checkboxes). Values source: `static` (inline list) or `directory` (dynamic scan of a workspace subfolder — reflects current disk state on each run).
  - `kind: text` — InputBox for a free-text value (e.g. commit message, user query, regex).
  - Placeholder `{{parameter}}` in the body is substituted before sending to Claude.
- **FileSystemWatcher** — `.actions/*.md` changes rescan automatically; `$(refresh)` button for a manual rescan.
- **First-time trust flow** — `claude-actions.initWorkspace` command opens a visible terminal running `claude` for the one-shot trust approval per workspace. Surfaced in the welcome view and offered on trust-related run failures.
- **Claude CLI update flow** — `$(cloud-download)` button appears in the toolbar when a newer version is available on npm and no action is running. Visible terminal runs `npm install -g @anthropic-ai/claude-code@latest`, auto-prefixes `sudo` on Unix when the npm prefix is not writable (skipped on Windows).
- **Tooltip on hover** — full action metadata (name, description, parameter summary, file path, prompt preview).
- **Welcome view** — dedicated empty-state messages when no workspace is open or when `.actions/` is empty.
- **Cross-platform support** — macOS, Linux, Windows. `spawn('claude', ...)` transparently resolves `claude.cmd` on Windows.
- **Auto-build hook** (`hooks/post-edit-build.mjs`, `.claude/settings.json`) — on edits to `src/**`, `package.json`, `tsconfig.json` or `esbuild.config.*`, bumps patch, builds, packages and reinstalls the `.vsix`. Lock file guards against reentrancy. Cross-platform (Node-based).
- **Bundled agents** (`.claude/agents/`) — five project-specific subagents (`extension-dev`, `terminal-orchestrator`, `action-authoring`, `release-manager`, `ux-reviewer`).
- **Example actions** — `smoke-test`, `echo-parameter`, `echo-multi`, `echo-text` for quick validation.
