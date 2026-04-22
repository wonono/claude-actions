import * as vscode from "vscode";
import { ActionStore } from "../actions/ActionStore";

export function registerRefreshCommand(store: ActionStore): vscode.Disposable {
  return vscode.commands.registerCommand("claude-actions.refresh", async () => {
    await store.rescan();
  });
}
