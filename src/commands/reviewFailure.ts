import * as vscode from "vscode";
import { ActionStore } from "../actions/ActionStore";
import { FailureStatusBar } from "../views/FailureStatusBar";
import { LogFactory } from "../util/log";

export function registerReviewFailureCommand(
  store: ActionStore,
  statusBar: FailureStatusBar,
  logs: LogFactory,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "claude-actions.reviewFailure",
    async () => {
      const ids = statusBar.getUnacknowledged();
      if (ids.length === 0) {
        return;
      }

      let targetId = ids[0];
      if (ids.length > 1) {
        const picks = ids.map((id) => {
          const action = store.getById(id);
          return {
            label: action?.name ?? id,
            description: action ? undefined : "(deleted)",
            id,
          };
        });
        const chosen = await vscode.window.showQuickPick(picks, {
          placeHolder: "Select a failed action to review",
        });
        if (!chosen) {
          return;
        }
        targetId = chosen.id;
      }

      const channel = logs.getExisting(targetId);
      if (channel) {
        channel.show(true);
      } else {
        vscode.window.setStatusBarMessage(
          "No output available for this action.",
          3000,
        );
      }
      statusBar.acknowledge(targetId);
    },
  );
}
