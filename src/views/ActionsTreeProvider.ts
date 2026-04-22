import * as vscode from "vscode";
import { Action } from "../actions/ActionModel";
import { ActionStore } from "../actions/ActionStore";
import { ActionRunner } from "../actions/ActionRunner";
import { PinStore } from "../actions/PinStore";
import { iconForAction } from "./icons";

type TreeNode =
  | { kind: "action"; action: Action }
  | { kind: "progress"; actionId: string }
  | { kind: "header"; label: string }
  | { kind: "spacer" };

export class ActionsTreeProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private readonly subs: vscode.Disposable[] = [];

  constructor(
    private readonly store: ActionStore,
    private readonly runner: ActionRunner,
    private readonly pins: PinStore,
  ) {
    this.subs.push(store.onDidChange(() => this._onDidChange.fire()));
    this.subs.push(runner.onDidChangeState(() => this._onDidChange.fire()));
    this.subs.push(pins.onDidChange(() => this._onDidChange.fire()));
    this.subs.push(
      runner.onProgress((actionId) => {
        const action = store.getById(actionId);
        if (action) {
          this._onDidChange.fire({ kind: "action", action });
        }
      }),
    );
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === "action") {
      return this.renderActionItem(node.action);
    }
    if (node.kind === "progress") {
      return this.renderProgressItem(node.actionId);
    }
    if (node.kind === "header") {
      return this.renderHeader(node.label);
    }
    return this.renderSpacer();
  }

  getParent(_element: TreeNode): TreeNode | undefined {
    // Required for TreeView.reveal() to work. All nodes we expose are root
    // level except for "progress" which is a child of its action — but we
    // only call reveal() on action nodes, so returning undefined is safe.
    return undefined;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      const all = [...this.store.getAll()];
      const pinned = all
        .filter((a) => this.pins.isPinned(a.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      const unpinned = all
        .filter((a) => !this.pins.isPinned(a.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      const nodes: TreeNode[] = [];
      // Only show category headers when both groups exist — otherwise the
      // separation is meaningless (you'd have "Unpinned" as the only group).
      const showHeaders = pinned.length > 0 && unpinned.length > 0;
      if (showHeaders) {
        nodes.push({ kind: "header", label: "Pinned" });
      }
      for (const action of pinned) {
        nodes.push({ kind: "action", action });
      }
      if (showHeaders) {
        nodes.push({ kind: "spacer" });
        nodes.push({ kind: "header", label: "Actions" });
      }
      for (const action of unpinned) {
        nodes.push({ kind: "action", action });
      }
      return nodes;
    }
    if (element.kind === "action" && this.runner.isRunning(element.action.id)) {
      return [{ kind: "progress", actionId: element.action.id }];
    }
    return [];
  }

  private renderActionItem(action: Action): vscode.TreeItem {
    const running = this.runner.isRunning(action.id);
    const pinned = this.pins.isPinned(action.id);
    const item = new vscode.TreeItem(
      action.name,
      running
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = action.id;
    item.description = action.description;
    item.tooltip = buildTooltip(action);
    item.iconPath = iconForAction(action.icon, running);
    item.contextValue = `action.${running ? "in_progress" : "ready"}.${pinned ? "pinned" : "unpinned"}`;
    item.command = {
      command: "vscode.open",
      title: "Open action file",
      arguments: [vscode.Uri.file(action.filePath)],
    };
    return item;
  }

  private renderSpacer(): vscode.TreeItem {
    const item = new vscode.TreeItem("", vscode.TreeItemCollapsibleState.None);
    item.id = "spacer:pinned-unpinned";
    item.contextValue = "spacer";
    return item;
  }

  private renderHeader(label: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.id = `header:${label.toLowerCase()}`;
    item.contextValue = "header";
    item.iconPath = new vscode.ThemeIcon(label === "Pinned" ? "pinned" : "list-unordered");
    return item;
  }

  private renderProgressItem(actionId: string): vscode.TreeItem {
    const line = this.runner.getLastLine(actionId);
    const startedAt = this.runner.getStartedAt(actionId);
    const label = truncate(line ?? "Waiting for output…", 80);
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.id = `${actionId}:progress`;
    item.description = startedAt ? formatUptime(Date.now() - startedAt) : "";
    item.iconPath = new vscode.ThemeIcon("debug-stackframe-dot");
    item.contextValue = "action.progress";
    item.command = {
      command: "claude-actions.showOutput",
      title: "Show action output",
      arguments: [actionId],
    };
    return item;
  }

  dispose(): void {
    for (const s of this.subs) {
      s.dispose();
    }
    this._onDidChange.dispose();
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return s.slice(0, max - 1) + "…";
}

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

function buildTooltip(action: Action): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  md.appendMarkdown(`**${action.name}**\n\n`);
  if (action.description) {
    md.appendMarkdown(`${action.description}\n\n`);
  }
  md.appendMarkdown(`\`${action.filePath}\`\n\n`);
  const preview = action.body.length > 240 ? action.body.slice(0, 240) + "…" : action.body;
  md.appendCodeblock(preview, "markdown");
  return md;
}
