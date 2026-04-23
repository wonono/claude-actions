# Claude Actions

> ⚠️ **Unofficial extension.** Not affiliated with Anthropic. This extension is a community tool that wraps the `claude` CLI to run shared, versioned prompts from the VS Code sidebar.

A VS Code extension that turns versioned markdown files into one-click Claude prompts. Put an action file in `.actions/` at the root of any repo, click the ▶ button in the sidebar, and Claude runs the prompt in the background — non-interactively, with the workspace as `cwd`. Multiple actions can run in parallel, each with its own output channel.

## Why

Teams accumulate Claude prompts for routine tasks (refactors, test generation, doc updates). Ad-hoc prompts get copy-pasted, lost, or diverge between teammates. An action file makes a prompt a first-class, reviewable, version-controlled artifact. Anyone cloning the repo instantly sees the same list of actions and can run them the same way.

## Prerequisites

| Requirement | Notes |
|---|---|
| **VS Code** ≥ 1.90 | |
| **Node.js** ≥ 18 | Required by the Claude CLI. |
| **Claude CLI** (`claude` on `PATH`) | [Install guide](https://docs.anthropic.com/en/docs/claude-code/quickstart). Minimum tested version: **2.1.80**. |

## Install

From the VS Code Extensions view, search for **Claude Actions** (publisher `wonono`) and click **Install** — or run from a terminal:

```bash
code --install-extension wonono.claude-actions
```

Reload your VS Code window if it was already open — you should see a new ⚡ icon in the activity bar.

<details>
<summary>Install from source</summary>

```bash
git clone https://github.com/wonono/claude-actions.git
cd claude-actions
npm install
npm run build
npx @vscode/vsce package --out dist/ --no-dependencies
code --install-extension dist/claude-actions-*.vsix --force
```

</details>

## Usage

### Running an action

1. Open a workspace that has (or should have) `.actions/*.md` files.
2. Click the ⚡ icon to open the Claude Actions sidebar.
3. Click the ▶ button next to an action. The icon turns into a spinner; an expanded child row shows the tail of Claude's output plus an uptime counter.
4. When the action finishes, a notification appears. Click **Show output** to inspect the full transcript in the `Claude Actions: <action-name>` output channel.
5. Click the **×** button to stop a running action (SIGTERM, SIGKILL after 2 s).

Each action row exposes inline buttons on hover — **run** / **stop**, **show output**, **pin**, **delete**. **Show output** stays available even after the action has finished (or failed) so you can always inspect the last transcript without waiting on the notification.

Actions run in **non-interactive mode** (`claude -p --dangerously-skip-permissions`) with a system prompt that forbids Claude from modifying `.claude/` or `.actions/`, asking questions, or running destructive shell commands.

### Creating an action

1. Click the **+** button in the sidebar toolbar.
2. Describe the action in plain English. Example: `Generate unit tests for the file I have open.`
3. Claude drafts a valid action file in `.actions/` and the sidebar picks it up automatically.

### Pinning

Click the 📌 pin icon next to any action to pin it. Pinned actions are sorted alphabetically at the top of the list; unpinned ones follow, also alphabetical. Pins are per-user, per-workspace (stored in VS Code's workspace state) — your teammates won't see them.

### Deleting an action

Click the 🗑 icon on an action row. A modal asks for confirmation; on accept, the file is moved to the OS trash (recoverable) and the sidebar refreshes. Deletion is disabled while the action is running — stop it first.

### Failure handling

When an action finishes with a non-zero exit code, or when Claude ends its response with a line starting with `failed:`, the extension treats the run as failed:

- The action's icon in the sidebar tints red until the next successful re-run.
- A red status bar item appears at the bottom-left: click it to open the action's output channel, which also acknowledges (dismisses) the alert. Re-running the action also clears the alert.
- An inline **output** button is always visible on every action row, so the transcript stays accessible even if you dismiss the notification or reload VS Code (the in-memory OutputChannel lives for the session).

The "semantic failure" path relies on the run-prompt contract: Claude is instructed to finish with `done` or `failed: <reason>` — nothing else. This keeps the final-response token count minimal while letting the extension report meaningful errors.

### Action file format

```markdown
---
id: kebab-case-id
name: Short Human Name
description: One sentence under 120 chars, shown in the sidebar
icon: wrench
---

The full prompt goes here, in English.

Say what you want Claude to do, what to avoid, and what "done" looks like.
```

Rules:

- `id` is the stable identity. Rename the file freely — as long as `id` stays, it's the same action.
- `icon` is a [VS Code codicon ID](https://microsoft.github.io/vscode-codicons/dist/codicon.html).
- **Actions must be written in English**, even if the consuming repo is not. This keeps them portable across teams.
- The body of the markdown *is* the prompt. The extension wraps it with system-level rules before sending it to Claude.
- The final line of Claude's response signals outcome: `done` (success) or `failed: <reason>` (semantic failure, see [Failure handling](#failure-handling)). The extension parses this to decide the run state.

### Parameters

An action can declare one or more parameters that the user fills in right before the run. Each parameter has a `key`; every occurrence of `{{key}}` in the body is replaced with the user-supplied value. The user is prompted once per parameter, in declaration order — cancelling any prompt aborts the whole run.

```markdown
---
id: write-release-note
name: Write Release Note
description: Draft a release note for a given channel with a custom summary
icon: megaphone
parameters:
  - kind: pick
    key: channel
    name: Channel
    description: Which channel is this release targeting?
    values:
      from: static
      list:
        - stable
        - beta
        - nightly
  - kind: text
    key: summary
    name: Summary
    description: One-line summary of what ships
    placeholder: "ship faster cache invalidation"
---

Draft a release note for the "{{channel}}" channel summarizing: {{summary}}.
```

**Two kinds:**

- `kind: pick` — the user picks from a fixed set of values (VS Code QuickPick). Values come from `values.from: static` (inline `list:`) or `values.from: directory` (enumerate subdirs or files under `values.path:`). Set `multiple: true` to allow multi-select — the placeholder then receives a comma-joined string.
- `kind: text` — the user types free text (VS Code InputBox). Optional `placeholder:` shows a greyed-out example. Set `defaultFrom: activeFile` to pre-fill the input with the workspace-relative path of the file currently focused in the editor — handy for actions that target "whatever I'm looking at" (`convert-blade`, `summarize-current-md`, etc.). The value is editable; the user just hits Enter to confirm. If no editor is focused, or the file lives outside the workspace, the field opens empty.

**Key rules:**

- `key` must match `[a-zA-Z_][a-zA-Z0-9_-]*` (letters, digits, underscores, dashes; no spaces). Two parameters in the same action must not share a key.
- Reference parameters in the body as `{{key}}`. A parameter whose key never appears in the body still gets prompted but its value is discarded — useful for refactors in progress, but normally every declared key should be wired.
- **Backward compatibility**: the legacy singular form (`parameter:` instead of `parameters:`, no `key:` field) is still accepted. It is normalized to a one-item list whose key defaults to `parameter`, so existing actions with `{{parameter}}` in the body keep working unchanged. Prefer the plural list for new actions.

## First-time trust

If Claude refuses to work in a fresh folder, click **Initialize workspace** in the sidebar welcome view (or run **Claude Actions: Initialize Workspace for Claude** from the command palette). This opens a visible terminal with `claude` — approve any trust prompt, then close the terminal. You only need to do this once per workspace.

## Updating Claude

When a newer `claude` CLI is available, a ☁️↓ button appears in the sidebar toolbar (next to **+**). It only shows up when:

- a newer version exists on npm,
- no action is currently running,
- no update is already in progress.

Clicking it opens a visible terminal that runs `npm install -g @anthropic-ai/claude-code@latest`. While the update runs, run / create / update buttons are disabled to avoid racing. Close the terminal when the install finishes; the extension re-checks the version and clears the flag.

If the update fails with a permissions error (common when Node was installed with the official macOS installer), you have three options:

1. **Use a version manager** (recommended): install Node via `nvm` or `fnm`. No sudo needed.
2. **Run with sudo**: `sudo npm install -g @anthropic-ai/claude-code@latest` (do this manually in a terminal — the extension intentionally doesn't auto-escalate).
3. **Fix npm prefix**: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally.

## Sharing actions with your team

Actions live in `.actions/` and are meant to be committed. Anyone cloning the repo gets the same list of actions, identical wording, identical behavior. When adding an action by hand, write the body in English and keep the prompt self-contained — don't reference Slack threads, internal tickets, or other private context.

## Troubleshooting

- **"Claude CLI not found in PATH"**: install the `claude` CLI and make sure `which claude` works in the same terminal as VS Code.
- **An action shows a red icon or a red status bar item**: the last run failed — either the CLI exited non-zero or Claude reported `failed: <reason>`. Click the status bar item, or the inline output button on the action row, to inspect the transcript.
- **Sidebar empty even though `.actions/` has files**: check the global `Claude Actions` output channel — parse warnings (missing frontmatter, bad parameter schema, duplicate keys) appear there.
- **A parameter is collected but doesn't affect the prompt**: make sure the body references it as `{{key}}` — the key must match the parameter's `key:` field exactly (case-sensitive).

## Development

```bash
npm install
npm run watch          # rebuild on save (esbuild in watch mode)
```

Press **F5** in VS Code to launch an Extension Development Host with the latest build. The project uses esbuild to bundle `src/extension.ts` into `dist/extension.js`.

A post-edit hook (`hooks/post-edit-build.mjs`) can auto-bump the patch version, rebuild, package the `.vsix`, and reinstall the extension locally — see `.claude/settings.json` for wiring details. The auto-install step requires `code` to be on your `PATH` (VS Code command palette → **Shell Command: Install 'code' command in PATH**).

## Contributing

Issues and pull requests are welcome. When adding or editing action files, keep two rules:

1. Write the action body in English.
2. Keep the prompt self-contained — assume the person running it has nothing but the repo open.

## License

MIT.
