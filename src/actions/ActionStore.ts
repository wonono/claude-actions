import * as vscode from "vscode";
import { Action, parseAction } from "./ActionModel";
import { getActionsDir, setNoActionsContext } from "../util/workspace";

export class ActionStore implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private actions: Action[] = [];

  constructor(private readonly log: vscode.OutputChannel) {}

  getAll(): readonly Action[] {
    return this.actions;
  }

  getById(id: string): Action | undefined {
    return this.actions.find((a) => a.id === id);
  }

  async rescan(): Promise<void> {
    const dir = getActionsDir();
    if (!dir) {
      this.actions = [];
      await this.publish();
      return;
    }

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch (err) {
      // Directory likely doesn't exist yet — empty list is the right answer.
      this.log.appendLine(`[store] readDirectory failed: ${String(err)}`);
      this.actions = [];
      await this.publish();
      return;
    }

    const mdEntries = entries.filter(
      ([name, type]) => type === vscode.FileType.File && name.toLowerCase().endsWith(".md"),
    );

    const parsed: Action[] = [];
    for (const [name] of mdEntries) {
      const fileUri = vscode.Uri.joinPath(dir, name);
      try {
        const bytes = await vscode.workspace.fs.readFile(fileUri);
        const text = Buffer.from(bytes).toString("utf8");
        const { action, warnings } = parseAction(text, fileUri.fsPath, name);
        for (const w of warnings) {
          this.log.appendLine(`[store] ${name}: ${w}`);
        }
        if (action) {
          parsed.push(action);
        }
      } catch (err) {
        this.log.appendLine(`[store] failed to read ${name}: ${String(err)}`);
      }
    }

    // Detect duplicate ids and keep the first occurrence (alpha by filename).
    parsed.sort((a, b) => a.filePath.localeCompare(b.filePath));
    const seen = new Set<string>();
    const deduped: Action[] = [];
    for (const action of parsed) {
      if (seen.has(action.id)) {
        this.log.appendLine(`[store] duplicate id "${action.id}" — skipping ${action.filePath}`);
        continue;
      }
      seen.add(action.id);
      deduped.push(action);
    }

    this.actions = deduped;
    await this.publish();
  }

  private async publish(): Promise<void> {
    await setNoActionsContext(this.actions.length === 0);
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
