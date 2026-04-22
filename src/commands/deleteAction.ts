import * as vscode from "vscode";
import { Action } from "../actions/ActionModel";
import { ActionStore } from "../actions/ActionStore";
import { ActionRunner } from "../actions/ActionRunner";

export function registerDeleteCommand(
  store: ActionStore,
  runner: ActionRunner,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "claude-actions.delete",
    async (target: unknown) => {
      const action = resolveAction(target, store);
      if (!action) {
        vscode.window.showWarningMessage("Select an action from the sidebar.");
        return;
      }
      if (runner.isRunning(action.id)) {
        vscode.window.showWarningMessage(
          `Action "${action.name}" is running — stop it before deleting.`,
        );
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Delete action "${action.name}"?`,
        {
          modal: true,
          detail: `This removes ${action.filePath}. The file will be moved to the OS trash.`,
        },
        "Delete",
      );
      if (confirm !== "Delete") {
        return;
      }

      try {
        await vscode.workspace.fs.delete(vscode.Uri.file(action.filePath), {
          useTrash: true,
        });
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to delete action "${action.name}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return;
      }
      // The FileSystemWatcher in extension.ts will pick this up and rescan,
      // but nudge the store directly so the UI updates immediately even on
      // platforms where the watcher lags.
      await store.rescan();
    },
  );
}

function resolveAction(target: unknown, store: ActionStore): Action | undefined {
  if (!target || typeof target !== "object") {
    return undefined;
  }
  const t = target as { kind?: string; action?: Action; id?: string };
  if (t.kind === "action" && t.action) {
    return t.action;
  }
  if (typeof t.id === "string") {
    return store.getById(t.id);
  }
  return undefined;
}
