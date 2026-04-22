import * as vscode from "vscode";
import { ClaudeVersionChecker } from "../util/claudeVersion";

export function registerUpdateClaudeCommand(
  checker: ClaudeVersionChecker,
): vscode.Disposable {
  return vscode.commands.registerCommand("claude-actions.updateClaude", async () => {
    await vscode.commands.executeCommand("setContext", "claude-actions.updating", true);

    const terminal = vscode.window.createTerminal({
      name: "Claude Actions: Update",
    });
    terminal.show(false);
    terminal.sendText("npm install -g @anthropic-ai/claude-code@latest", true);

    // When the user closes the terminal, we assume the update flow is over
    // (success or failure — the terminal output tells them). We then re-check
    // versions to clear the flag if the update landed.
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
