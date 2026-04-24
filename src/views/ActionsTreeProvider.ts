import * as vscode from "vscode";
import { Action } from "../actions/ActionModel";
import { ActionStore } from "../actions/ActionStore";
import { ActionRunner } from "../actions/ActionRunner";
import { PinStore } from "../actions/PinStore";
import { LastRun, LastRunStore } from "../actions/LastRunStore";
import { iconForAction } from "./icons";

const PINNED_LABEL = "Pinned";
const UNCATEGORIZED_LABEL = "Uncategorized";
const FLAT_UNPINNED_LABEL = "Actions";
const EXPANDED_STATE_KEY = "claude-actions.expandedGroups";

type TreeNode =
  | { kind: "action"; action: Action }
  | { kind: "progress"; actionId: string }
  | { kind: "group"; label: string; isPinned: boolean };

interface Group {
  label: string;
  isPinned: boolean;
  actions: Action[];
}

export class ActionsTreeProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private readonly subs: vscode.Disposable[] = [];
  private readonly expandedGroups: Set<string>;

  constructor(
    private readonly store: ActionStore,
    private readonly runner: ActionRunner,
    private readonly pins: PinStore,
    private readonly lastRuns: LastRunStore,
    private readonly state: vscode.Memento,
  ) {
    const stored = state.get<string[]>(EXPANDED_STATE_KEY, [PINNED_LABEL]);
    this.expandedGroups = new Set(stored);

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

  attachTreeView(view: vscode.TreeView<TreeNode>): void {
    this.subs.push(
      view.onDidExpandElement((e) => {
        if (e.element.kind !== "group") {
          return;
        }
        if (!this.expandedGroups.has(e.element.label)) {
          this.expandedGroups.add(e.element.label);
          void this.persistExpanded();
          // Refire the group so the folder icon swaps to folder-opened.
          this._onDidChange.fire(e.element);
        }
      }),
    );
    this.subs.push(
      view.onDidCollapseElement((e) => {
        if (e.element.kind !== "group") {
          return;
        }
        if (this.expandedGroups.delete(e.element.label)) {
          void this.persistExpanded();
          this._onDidChange.fire(e.element);
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
    return this.renderGroup(node);
  }

  getParent(element: TreeNode): TreeNode | undefined {
    if (element.kind === "action") {
      const groups = this.computeGroups();
      if (groups.length === 0) {
        return undefined;
      }
      for (const g of groups) {
        if (g.actions.some((a) => a.id === element.action.id)) {
          return { kind: "group", label: g.label, isPinned: g.isPinned };
        }
      }
      return undefined;
    }
    if (element.kind === "progress") {
      const action = this.store.getById(element.actionId);
      return action ? { kind: "action", action } : undefined;
    }
    return undefined;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      const groups = this.computeGroups();
      if (groups.length === 0) {
        // Legacy mode (no categories declared, no pins) — flat list.
        return [...this.store.getAll()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((action): TreeNode => ({ kind: "action", action }));
      }
      return groups.map(
        (g): TreeNode => ({ kind: "group", label: g.label, isPinned: g.isPinned }),
      );
    }
    if (element.kind === "group") {
      const groups = this.computeGroups();
      const match = groups.find(
        (g) => g.label === element.label && g.isPinned === element.isPinned,
      );
      if (!match) {
        return [];
      }
      return [...match.actions]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((action): TreeNode => ({ kind: "action", action }));
    }
    if (element.kind === "action" && this.runner.isRunning(element.action.id)) {
      return [{ kind: "progress", actionId: element.action.id }];
    }
    return [];
  }

  private computeGroups(): Group[] {
    const all = this.store.getAll();
    if (all.length === 0) {
      return [];
    }
    const pinned = all.filter((a) => this.pins.isPinned(a.id));
    const unpinned = all.filter((a) => !this.pins.isPinned(a.id));
    const anyCategory = all.some((a) => a.category !== undefined);

    if (!anyCategory) {
      // Legacy layout: flat if everything is in one bucket, Pinned + Actions otherwise.
      if (pinned.length === 0 || unpinned.length === 0) {
        return [];
      }
      return [
        { label: PINNED_LABEL, isPinned: true, actions: pinned },
        { label: FLAT_UNPINNED_LABEL, isPinned: false, actions: unpinned },
      ];
    }

    const groups: Group[] = [];
    if (pinned.length > 0) {
      groups.push({ label: PINNED_LABEL, isPinned: true, actions: pinned });
    }

    const byCategory = new Map<string, Action[]>();
    for (const a of unpinned) {
      const cat = a.category ?? UNCATEGORIZED_LABEL;
      let bucket = byCategory.get(cat);
      if (!bucket) {
        bucket = [];
        byCategory.set(cat, bucket);
      }
      bucket.push(a);
    }

    const namedCategories = [...byCategory.keys()]
      .filter((c) => c !== UNCATEGORIZED_LABEL)
      .sort((a, b) => a.localeCompare(b));
    for (const name of namedCategories) {
      groups.push({ label: name, isPinned: false, actions: byCategory.get(name)! });
    }
    const uncategorized = byCategory.get(UNCATEGORIZED_LABEL);
    if (uncategorized) {
      groups.push({ label: UNCATEGORIZED_LABEL, isPinned: false, actions: uncategorized });
    }
    return groups;
  }

  private persistExpanded(): Thenable<void> {
    return this.state.update(EXPANDED_STATE_KEY, [...this.expandedGroups]);
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

  private renderGroup(node: { label: string; isPinned: boolean }): vscode.TreeItem {
    const expanded = this.expandedGroups.has(node.label);
    const item = new vscode.TreeItem(
      node.label,
      expanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.id = `group:${node.label}`;
    item.contextValue = "header";
    let iconId: string;
    if (node.isPinned) {
      iconId = "pinned";
    } else if (node.label === FLAT_UNPINNED_LABEL) {
      iconId = "list-unordered";
    } else {
      iconId = expanded ? "folder-opened" : "folder";
    }
    item.iconPath = new vscode.ThemeIcon(iconId);
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
  if (action.category) {
    md.appendMarkdown(`Category: *${action.category}*\n\n`);
  }
  for (const p of action.parameters) {
    const suffix =
      p.kind === "text" ? " (free text)" : p.multiple ? " (multi-select)" : "";
    md.appendMarkdown(`Parameter \`{{${p.key}}}\`: *${p.name}*${suffix}\n\n`);
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
