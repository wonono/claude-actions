import * as vscode from "vscode";
import { ActionRunner } from "../actions/ActionRunner";
import { ActionStore } from "../actions/ActionStore";

export class FailureStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly unacked = new Set<string>();
  private readonly subs: vscode.Disposable[] = [];

  constructor(
    private readonly store: ActionStore,
    runner: ActionRunner,
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.name = "Claude Actions — failures";
    this.item.command = {
      command: "claude-actions.reviewFailure",
      title: "Review failed action",
    };
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");

    this.subs.push(
      runner.onDidFinish((ev) => {
        if (ev.status === "failed") {
          this.unacked.add(ev.actionId);
        } else {
          this.unacked.delete(ev.actionId);
        }
        this.update();
      }),
    );
    // Re-running an action clears its prior failure alert — the user is
    // actively retrying, so the old notice is no longer actionable.
    this.subs.push(
      runner.onDidChangeState((actionId) => {
        if (runner.isRunning(actionId) && this.unacked.delete(actionId)) {
          this.update();
        }
      }),
    );
    this.subs.push(
      store.onDidChange(() => {
        // If a failed action was deleted from disk, drop its alert.
        let changed = false;
        for (const id of this.unacked) {
          if (!store.getById(id)) {
            this.unacked.delete(id);
            changed = true;
          }
        }
        if (changed) {
          this.update();
        } else if (this.unacked.size > 0) {
          // Name in the status bar label may need to refresh if the action
          // was renamed.
          this.update();
        }
      }),
    );
  }

  getUnacknowledged(): string[] {
    return [...this.unacked];
  }

  acknowledge(actionId: string): void {
    if (this.unacked.delete(actionId)) {
      this.update();
    }
  }

  private update(): void {
    if (this.unacked.size === 0) {
      this.item.hide();
      return;
    }
    if (this.unacked.size === 1) {
      const id = [...this.unacked][0];
      const name = this.store.getById(id)?.name ?? id;
      this.item.text = `$(error) "${name}" failed`;
      this.item.tooltip = `Last run of "${name}" reported a failure. Click to show the output.`;
    } else {
      this.item.text = `$(error) ${this.unacked.size} actions failed`;
      this.item.tooltip = "Click to review failed actions";
    }
    this.item.show();
  }

  dispose(): void {
    for (const s of this.subs) {
      s.dispose();
    }
    this.item.dispose();
  }
}
