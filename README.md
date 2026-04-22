# Claude Actions

> ⚠️ **Unofficial extension.** Not affiliated with Anthropic. This extension is a community tool that wraps the `claude` CLI to run shared, versioned prompts from the VS Code sidebar.

A VS Code extension that turns versioned markdown files into one-click Claude prompts. Put an action file in `.actions/` at the root of any repo, click the ▶ button in the sidebar, and Claude runs the prompt in the background — non-interactively, with the workspace as `cwd`. Multiple actions can run in parallel, each with its own output channel.

## Why

Teams accumulate Claude prompts for routine tasks (refactors, test generation, doc updates). Ad-hoc prompts get copy-pasted, lost, or diverge between teammates. An action file makes a prompt a first-class, reviewable, version-controlled artifact. Anyone cloning the repo instantly sees the same list of actions and can run them the same way.

## Prerequisites

| Requirement | Notes |
|---|---|
| **VS Code** ≥ 1.90 | |
| **Node.js** ≥ 18 | Required by the Claude CLI and to build from source. |
| **Claude CLI** (`claude` on `PATH`) | [Install guide](https://docs.anthropic.com/en/docs/claude-code/quickstart). Minimum tested version: **2.1.80**. |
| **`code` on `PATH`** | VS Code command palette → **Shell Command: Install 'code' command in PATH**. Needed for the auto-update reinstall flow. |

## Install

Until the extension is published on the Marketplace, install the `.vsix` directly:

```bash
git clone https://github.com/wonono/claude-actions.git
cd claude-actions
npm install
npm run build
npx @vscode/vsce package --out dist/ --no-dependencies
code --install-extension dist/claude-actions-*.vsix --force
```

Reload your VS Code window — you should see a new ⚡ icon in the activity bar.

## Usage

### Running an action

1. Open a workspace that has (or should have) `.actions/*.md` files.
2. Click the ⚡ icon to open the Claude Actions sidebar.
3. Click the ▶ button next to an action. The icon turns into a spinner; an expanded child row shows the tail of Claude's output plus an uptime counter.
4. When the action finishes, a notification appears. Click **Show output** to inspect the full transcript in the `Claude Actions: <action-name>` output channel.
5. Click the **×** button to stop a running action (SIGTERM, SIGKILL after 2 s).

Actions run in **non-interactive mode** (`claude -p --dangerously-skip-permissions`) with a system prompt that forbids Claude from modifying `.claude/` or `.actions/`, asking questions, or running destructive shell commands.

### Creating an action

1. Click the **+** button in the sidebar toolbar.
2. Describe the action in plain English. Example: `Generate unit tests for the file I have open.`
3. Claude drafts a valid action file in `.actions/` and the sidebar picks it up automatically.

### Pinning

Click the 📌 pin icon next to any action to pin it. Pinned actions are sorted alphabetically at the top of the list; unpinned ones follow, also alphabetical. Pins are per-user, per-workspace (stored in VS Code's workspace state) — your teammates won't see them.

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
- **Action finishes with exit ≠ 0**: click **Show output** on the notification. The per-action channel has Claude's raw stdout and stderr.
- **Sidebar empty even though `.actions/` has files**: check the global `Claude Actions` output channel — parse warnings (missing frontmatter, duplicate IDs) appear there.

## Development

```bash
npm install
npm run watch          # rebuild on save (esbuild in watch mode)
```

Press **F5** in VS Code to launch an Extension Development Host with the latest build. The project uses esbuild to bundle `src/extension.ts` into `dist/extension.js`.

A post-edit hook (`hooks/post-edit-build.sh`) can auto-bump the patch version, rebuild, package the `.vsix`, and reinstall the extension — see `.claude/settings.json` for wiring details.

## Contributing

Issues and pull requests are welcome. When adding or editing action files, keep two rules:

1. Write the action body in English.
2. Keep the prompt self-contained — assume the person running it has nothing but the repo open.

## License

MIT.
