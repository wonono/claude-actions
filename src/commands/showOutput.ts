import * as vscode from "vscode";
import { LogFactory } from "../util/log";

export function registerShowOutputCommand(logs: LogFactory): vscode.Disposable {
  return vscode.commands.registerCommand(
    "claude-actions.showOutput",
    (actionId: string | undefined) => {
      if (!actionId) {
        return;
      }
      const channel = logs.getExisting(actionId);
      if (channel) {
        channel.show(true);
      } else {
        vscode.window.setStatusBarMessage(
          "No output yet for this action — run it first.",
          3000,
        );
      }
    },
  );
}
