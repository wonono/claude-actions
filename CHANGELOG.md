# Changelog

All notable changes to the Claude Actions extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-04-23

### Added
- **Multi-parameter actions** — an action can now declare any number of parameters via a top-level `parameters:` list; each entry has a `key`, referenced in the body as `{{key}}`. Parameters are prompted sequentially in declaration order (QuickPick for `pick`, InputBox for `text`); cancelling any step aborts the whole run.
- **`defaultFrom: activeFile`** (on `kind: text`) — pre-fills the InputBox with the workspace-relative path of the focused editor. The value is editable; the user hits Enter to confirm. Falls back to an empty field when no editor is focused or the file lives outside the workspace.
- **Semantic failure detection** — the run-prompt contract now asks Claude to finish with a single line, either `done` or `failed: <reason>`. The extension parses this tail and treats a `failed:` marker as a failed run even when exit code is 0. Keeps the final-response token count minimal.
- **Failed-run UI**:
  - Action icon tints red until the next successful re-run.
  - New status bar item (bottom-left, red background) listing the number of unacknowledged failed runs. Click it to jump to the corresponding output channel, which also dismisses the alert. Re-running an action clears its alert too.
- **Inline "show output" button** on every action row — the output channel lives for the whole session, so the transcript stays accessible after the completion notification is gone.
- **Inline "delete" button** with a confirmation modal — moves the action file to the OS trash (recoverable). Disabled while the action is running.
- **Live uptime counter** — the running sub-item refreshes once per second independently of stdout activity (previously the counter appeared frozen between output chunks).
- **Marketplace listing** — the extension is now published under publisher `wonono`; install via `code --install-extension wonono.claude-actions` or from the Extensions view.

### Changed
- **Minimal final response** — Claude is instructed to emit only `done` / `failed: <reason>` at the end, skipping the usual summary. Action runs are one-shot and the user never reads the conversation, so this trims tokens without losing information.
- **Action row context menu** — reorganized inline buttons (run/stop, show output, pin/unpin, delete).

### Fixed
- **"Creating action…" notification stayed open after completion** — the progress spinner used to wait for the follow-up "Action created" info message to be dismissed. It now resolves as soon as the `claude` process exits.

### Compatibility
- Existing actions using the singular `parameter:` block (with no `key:` field) keep working: they're normalized into a one-item list whose key defaults to `parameter`, so `{{parameter}}` in the body is still substituted as before.

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
