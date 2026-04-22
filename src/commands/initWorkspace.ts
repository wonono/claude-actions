import * as vscode from "vscode";

export function registerInitWorkspaceCommand(): vscode.Disposable {
  return vscode.commands.registerCommand("claude-actions.initWorkspace", () => {
    const terminal = vscode.window.createTerminal({
      name: "Claude Actions: Initialize",
    });
    terminal.show(false);
    // Send the command with a trailing newline so the user sees claude start
    // immediately and can approve whatever prompt claude shows (trust, etc.).
    terminal.sendText("claude", true);
  });
}
