import * as vscode from "vscode";

export type LastRunStatus = "done" | "failed";

export interface LastRun {
  status: LastRunStatus;
  message?: string;
  endedAt: number;
  durationMs: number;
}

export class LastRunStore implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<string>();
  readonly onDidChange = this._onDidChange.event;

  private readonly entries = new Map<string, LastRun>();

  get(actionId: string): LastRun | undefined {
    return this.entries.get(actionId);
  }

  record(actionId: string, run: LastRun): void {
    this.entries.set(actionId, run);
    this._onDidChange.fire(actionId);
  }

  clear(actionId: string): void {
    if (this.entries.delete(actionId)) {
      this._onDidChange.fire(actionId);
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
