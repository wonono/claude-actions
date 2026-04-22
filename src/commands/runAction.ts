import * as vscode from "vscode";
import { Action } from "../actions/ActionModel";
import { ActionStore } from "../actions/ActionStore";
import { ActionRunner } from "../actions/ActionRunner";

export function registerRunCommand(
  store: ActionStore,
  runner: ActionRunner,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "claude-actions.run",
    (target: unknown) => {
      const action = resolveAction(target, store);
      if (!action) {
        vscode.window.showWarningMessage("Select an action from the sidebar.");
        return;
      }
      if (runner.isRunning(action.id)) {
        return;
      }
      runner.start(action);
    },
  );
}

function resolveAction(target: unknown, store: ActionStore): Action | undefined {
  if (!target || typeof target !== "object") {
    return undefined;
  }
  const t = target as { kind?: string; action?: Action; id?: string; body?: string };
  if (t.kind === "action" && t.action) {
    return t.action;
  }
  if (typeof t.body === "string" && typeof t.id === "string") {
    return t as unknown as Action;
  }
  if (typeof t.id === "string") {
    return store.getById(t.id);
  }
  return undefined;
}
