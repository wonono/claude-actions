import * as vscode from "vscode";

export function iconForAction(iconId: string, running: boolean): vscode.ThemeIcon {
  if (running) {
    return new vscode.ThemeIcon("sync~spin");
  }
  return new vscode.ThemeIcon(iconId);
}
