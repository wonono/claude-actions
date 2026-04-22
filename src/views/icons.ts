import * as vscode from "vscode";

export function iconForAction(
  iconId: string,
  running: boolean,
  lastFailed = false,
): vscode.ThemeIcon {
  if (running) {
    return new vscode.ThemeIcon("sync~spin");
  }
  if (lastFailed) {
    // Keep the action's own icon (so the row stays recognizable) but tint
    // it in red to signal the last run failed.
    return new vscode.ThemeIcon(iconId, new vscode.ThemeColor("testing.iconFailed"));
  }
  return new vscode.ThemeIcon(iconId);
}
