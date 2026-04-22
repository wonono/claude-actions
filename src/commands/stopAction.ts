import * as vscode from "vscode";
import { Action } from "../actions/ActionModel";
import { ActionRunner } from "../actions/ActionRunner";

export function registerStopCommand(runner: ActionRunner): vscode.Disposable {
  return vscode.commands.registerCommand(
    "claude-actions.stop",
    (target: unknown) => {
      const id = resolveId(target);
      if (!id) {
        return;
      }
      runner.stop(id);
    },
  );
}

function resolveId(target: unknown): string | undefined {
  if (!target || typeof target !== "object") {
    return undefined;
  }
  const t = target as { kind?: string; action?: Action; id?: string };
  if (t.kind === "action" && t.action) {
    return t.action.id;
  }
  return typeof t.id === "string" ? t.id : undefined;
}
