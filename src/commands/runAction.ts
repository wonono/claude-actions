import * as vscode from "vscode";
import { Action } from "../actions/ActionModel";
import { ActionStore } from "../actions/ActionStore";
import { ActionRunner } from "../actions/ActionRunner";
import {
  placeholderKeys,
  resolveParameters,
  substituteParameters,
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
      if (action.parameters.length > 0) {
        const root = getWorkspaceRoot();
        if (!root) {
          vscode.window.showErrorMessage("Open a folder before running a parameterised action.");
          return;
        }
        const values = await resolveParameters(action.parameters, root);
        if (values === undefined) {
          // Any step cancelled — abort silently.
          return;
        }

        const keys = placeholderKeys(body);
        const unused = action.parameters
          .filter((p) => !keys.has(p.key))
          .map((p) => `{{${p.key}}}`);
        if (unused.length === action.parameters.length) {
          vscode.window.showWarningMessage(
            `Action "${action.name}" declares ${action.parameters.length} parameter(s) but the prompt uses none of them (expected one of ${unused.join(", ")}).`,
          );
        }
        body = substituteParameters(body, values);
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
