import * as vscode from "vscode";
import { Action } from "../actions/ActionModel";
import { ActionStore } from "../actions/ActionStore";
import { ActionRunner } from "../actions/ActionRunner";
import {
  hasPlaceholder,
  resolveParameter,
  substituteParameter,
} from "../actions/parameterResolver";
import { getWorkspaceRoot } from "../util/workspace";

export function registerRunCommand(
  store: ActionStore,
  runner: ActionRunner,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "claude-actions.run",
    async (target: unknown) => {
      const action = resolveAction(target, store);
      if (!action) {
        vscode.window.showWarningMessage("Select an action from the sidebar.");
        return;
      }
      if (runner.isRunning(action.id)) {
        return;
      }

      let body = action.body;
      if (action.parameter) {
        const root = getWorkspaceRoot();
        if (!root) {
          vscode.window.showErrorMessage("Open a folder before running a parameterised action.");
          return;
        }
        const value = await resolveParameter(action.parameter, root);
        if (value === undefined) {
          // User cancelled the QuickPick — abort silently.
          return;
        }
        if (!hasPlaceholder(body)) {
          vscode.window.showWarningMessage(
            `Action "${action.name}" declares a parameter but its prompt has no \`{{parameter}}\` placeholder — the chosen value will be ignored.`,
          );
        } else {
          body = substituteParameter(body, value);
        }
      }

      runner.start(action, body);
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
