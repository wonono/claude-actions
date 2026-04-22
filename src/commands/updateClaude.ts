import * as vscode from "vscode";
import { access, constants } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ClaudeVersionChecker } from "../util/claudeVersion";

const execFileP = promisify(execFile);

export function registerUpdateClaudeCommand(
  checker: ClaudeVersionChecker,
): vscode.Disposable {
  return vscode.commands.registerCommand("claude-actions.updateClaude", async () => {
    await vscode.commands.executeCommand("setContext", "claude-actions.updating", true);

    const requiresSudo = await needsSudoForGlobalNpm();
    const command = requiresSudo
      ? "sudo npm install -g @anthropic-ai/claude-code@latest"
      : "npm install -g @anthropic-ai/claude-code@latest";

    const terminal = vscode.window.createTerminal({
      name: "Claude Actions: Update",
    });
    terminal.show(false);
    if (requiresSudo) {
      // Purely informational echo so non-dev users understand the password
      // prompt that's about to appear. sendText prepends to the shell, not to
      // the command itself, so we chain with `&&`.
      terminal.sendText(
        `echo '[claude-actions] npm global prefix is not writable — running with sudo' && ${command}`,
        true,
      );
    } else {
      terminal.sendText(command, true);
    }

    const disposable = vscode.window.onDidCloseTerminal(async (closed) => {
      if (closed !== terminal) {
        return;
      }
      disposable.dispose();
      const info = await checker.refresh({ force: true });
      await vscode.commands.executeCommand("setContext", "claude-actions.updating", false);

      if (info.local && info.latest && !info.updateAvailable) {
        vscode.window.showInformationMessage(`Claude CLI updated to ${info.local}.`);
      } else if (info.updateAvailable) {
        vscode.window.showWarningMessage(
          `Claude CLI is still at ${info.local ?? "?"}. Update did not apply — check the terminal output.`,
        );
      }
    });
  });
}

async function needsSudoForGlobalNpm(): Promise<boolean> {
  // Windows has no `sudo`; elevation happens at the process/session level
  // (Run as Administrator), not via a command prefix. Even if the prefix
  // isn't writable, prepending `sudo` would just produce a "not recognized"
  // error, worse UX than letting npm's own EACCES surface.
  if (process.platform === "win32") {
    return false;
  }
  try {
    const { stdout } = await execFileP("npm", ["prefix", "-g"], {
      timeout: 5000,
    });
    const prefix = stdout.trim();
    if (!prefix) {
      return false;
    }
    try {
      await access(prefix, constants.W_OK);
      return false;
    } catch {
      return true;
    }
  } catch {
    // Couldn't run `npm prefix -g` at all — don't force sudo blindly.
    return false;
  }
}
