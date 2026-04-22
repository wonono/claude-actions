import * as vscode from "vscode";

const STATE_KEY = "claude-actions.pinnedIds";

export class PinStore implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private pinned: Set<string>;

  constructor(private readonly state: vscode.Memento) {
    const initial = state.get<string[]>(STATE_KEY, []);
    this.pinned = new Set(initial);
  }

  isPinned(id: string): boolean {
    return this.pinned.has(id);
  }

  async pin(id: string): Promise<void> {
    if (this.pinned.has(id)) {
      return;
    }
    this.pinned.add(id);
    await this.persist();
    this._onDidChange.fire();
  }

  async unpin(id: string): Promise<void> {
    if (!this.pinned.delete(id)) {
      return;
    }
    await this.persist();
    this._onDidChange.fire();
  }

  private persist(): Thenable<void> {
    return this.state.update(STATE_KEY, [...this.pinned]);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
