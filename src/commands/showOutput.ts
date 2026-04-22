import * as vscode from "vscode";
import { LogFactory } from "../util/log";

export function registerShowOutputCommand(logs: LogFactory): vscode.Disposable {
  return vscode.commands.registerCommand(
    "claude-actions.showOutput",
    (target: unknown) => {
      const actionId = resolveActionId(target);
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

function resolveActionId(target: unknown): string | undefined {
  if (typeof target === "string") {
    return target;
  }
  if (!target || typeof target !== "object") {
    return undefined;
  }
  const t = target as { kind?: string; action?: { id?: string }; actionId?: string; id?: string };
  if (t.kind === "action" && t.action?.id) {
    return t.action.id;
  }
  if (typeof t.actionId === "string") {
    return t.actionId;
  }
  if (typeof t.id === "string") {
    return t.id;
  }
  return undefined;
}
