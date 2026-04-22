import * as vscode from "vscode";
import { Action } from "../actions/ActionModel";
import { ActionStore } from "../actions/ActionStore";
import { ActionRunner } from "../actions/ActionRunner";
import { PinStore } from "../actions/PinStore";
import { LastRun, LastRunStore } from "../actions/LastRunStore";
import { iconForAction } from "./icons";

type TreeNode =
  | { kind: "action"; action: Action }
  | { kind: "progress"; actionId: string }
  | { kind: "header"; label: string };

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
    private readonly lastRuns: LastRunStore,
  ) {
    this.subs.push(store.onDidChange(() => this._onDidChange.fire()));
    this.subs.push(runner.onDidChangeState(() => this._onDidChange.fire()));
    this.subs.push(pins.onDidChange(() => this._onDidChange.fire()));
    this.subs.push(
      runner.onProgress(() => {
        // Full refresh. Firing on a specific element doesn't reliably
        // re-query its subtree when the TreeNode identity isn't preserved
        // (we build new objects every getChildren). The tree is tiny, so
        // undefined here is fine and keeps the uptime + last-line live.
        this._onDidChange.fire();
      }),
    );
    this.subs.push(
      lastRuns.onDidChange((actionId) => {
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
    return this.renderHeader(node.label);
  }

  getParent(element: TreeNode): TreeNode | undefined {
    if (element.kind === "action") {
      // An action is nested under a header only when both groups exist —
      // otherwise the list is flat at root.
      if (!this.hasBothGroups()) {
        return undefined;
      }
      return this.pins.isPinned(element.action.id)
        ? { kind: "header", label: "Pinned" }
        : { kind: "header", label: "Actions" };
    }
    if (element.kind === "progress") {
      const action = this.store.getById(element.actionId);
      return action ? { kind: "action", action } : undefined;
    }
    return undefined;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      if (this.hasBothGroups()) {
        return [
          { kind: "header", label: "Pinned" },
          { kind: "header", label: "Actions" },
        ];
      }
      // Only one group populated — skip the headers and render a flat list.
      return this.allActionsSorted().map((action): TreeNode => ({ kind: "action", action }));
    }
    if (element.kind === "header") {
      const wantPinned = element.label === "Pinned";
      return this.store
        .getAll()
        .filter((a) => this.pins.isPinned(a.id) === wantPinned)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((action): TreeNode => ({ kind: "action", action }));
    }
    if (element.kind === "action" && this.runner.isRunning(element.action.id)) {
      return [{ kind: "progress", actionId: element.action.id }];
    }
    return [];
  }

  private hasBothGroups(): boolean {
    const all = this.store.getAll();
    let hasPinned = false;
    let hasUnpinned = false;
    for (const a of all) {
      if (this.pins.isPinned(a.id)) {
        hasPinned = true;
      } else {
        hasUnpinned = true;
      }
      if (hasPinned && hasUnpinned) {
        return true;
      }
    }
    return false;
  }

  private allActionsSorted(): readonly import("../actions/ActionModel").Action[] {
    return [...this.store.getAll()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private renderActionItem(action: Action): vscode.TreeItem {
    const running = this.runner.isRunning(action.id);
    const pinned = this.pins.isPinned(action.id);
    const lastRun = running ? undefined : this.lastRuns.get(action.id);
    const item = new vscode.TreeItem(
      action.name,
      running
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = action.id;
    item.tooltip = buildTooltip(action, lastRun);
    item.iconPath = iconForAction(action.icon, running, lastRun?.status === "failed");
    item.contextValue = `action.${running ? "in_progress" : "ready"}.${pinned ? "pinned" : "unpinned"}`;
    item.command = {
      command: "vscode.open",
      title: "Open action file",
      arguments: [vscode.Uri.file(action.filePath)],
    };
    return item;
  }

  private renderHeader(label: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
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

function buildTooltip(action: Action, lastRun: LastRun | undefined): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  md.appendMarkdown(`**${action.name}**\n\n`);
  if (action.description) {
    md.appendMarkdown(`${action.description}\n\n`);
  }
  if (action.parameter) {
    const suffix =
      action.parameter.kind === "text"
        ? " (free text)"
        : action.parameter.multiple
        ? " (multi-select)"
        : "";
    md.appendMarkdown(`Parameter: *${action.parameter.name}*${suffix}\n\n`);
  }
  if (lastRun) {
    const when = new Date(lastRun.endedAt).toLocaleString();
    const duration = formatDuration(lastRun.durationMs);
    if (lastRun.status === "done") {
      md.appendMarkdown(`Last run: **done** · ${duration} · ${when}\n\n`);
    } else {
      md.appendMarkdown(`Last run: **failed** · ${duration} · ${when}\n\n`);
      if (lastRun.message) {
        md.appendCodeblock(lastRun.message, "text");
      }
    }
  }
  md.appendMarkdown(`\`${action.filePath}\`\n\n`);
  const preview = action.body.length > 240 ? action.body.slice(0, 240) + "…" : action.body;
  md.appendCodeblock(preview, "markdown");
  return md;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) {
    return `${totalSec}s`;
  }
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}
