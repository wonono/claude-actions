import * as vscode from "vscode";
import { ActionStore } from "./actions/ActionStore";
import { ActionRunner } from "./actions/ActionRunner";
import { PinStore } from "./actions/PinStore";
import { LastRunStore } from "./actions/LastRunStore";
import { ActionsTreeProvider } from "./views/ActionsTreeProvider";
import { FailureStatusBar } from "./views/FailureStatusBar";
import { registerRunCommand } from "./commands/runAction";
import { registerStopCommand } from "./commands/stopAction";
import { registerDeleteCommand } from "./commands/deleteAction";
import { registerRefreshCommand } from "./commands/refresh";
import { registerInitWorkspaceCommand } from "./commands/initWorkspace";
import { registerPinCommands } from "./commands/pinAction";
import { registerShowOutputCommand } from "./commands/showOutput";
import { registerCreateCommand } from "./commands/createAction";
import { registerUpdateClaudeCommand } from "./commands/updateClaude";
import { registerReviewFailureCommand } from "./commands/reviewFailure";
import { createLogFactory } from "./util/log";
import { ClaudeVersionChecker } from "./util/claudeVersion";
import { ensureActionsDir, getWorkspaceRoot, setNoActionsContext } from "./util/workspace";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logs = createLogFactory();
  context.subscriptions.push({ dispose: () => logs.dispose() });
  const log = logs.global;
  log.appendLine("[claude-actions] activated");

  const root = getWorkspaceRoot();
  if (!root) {
    log.appendLine("[claude-actions] no workspace folder open");
    await setNoActionsContext(true);
    return;
  }

  try {
    await ensureActionsDir();
    log.appendLine("[claude-actions] .actions/ ready");
  } catch (err) {
    log.appendLine(`[claude-actions] failed to create .actions/: ${String(err)}`);
  }

  const store = new ActionStore(log);
  context.subscriptions.push(store);

  const runner = new ActionRunner(logs, root.fsPath);
  context.subscriptions.push(runner);

  const pins = new PinStore(context.workspaceState);
  context.subscriptions.push(pins);

  const lastRuns = new LastRunStore();
  context.subscriptions.push(lastRuns);
  context.subscriptions.push(
    runner.onDidFinish((ev) => {
      lastRuns.record(ev.actionId, {
        status: ev.status,
        message: ev.message,
        endedAt: ev.endedAt,
        durationMs: ev.durationMs,
      });
    }),
  );

  const versionChecker = new ClaudeVersionChecker(log);
  context.subscriptions.push(versionChecker);

  const treeProvider = new ActionsTreeProvider(store, runner, pins, lastRuns, context.workspaceState);
  context.subscriptions.push(treeProvider);

  const failureStatusBar = new FailureStatusBar(store, runner);
  context.subscriptions.push(failureStatusBar);
  const treeView = vscode.window.createTreeView("claude-actions.list", {
    treeDataProvider: treeProvider,
  });
  context.subscriptions.push(treeView);
  treeProvider.attachTreeView(treeView);

  // When an action starts running, force its row to expand so the progress
  // sub-item is visible without the user having to click. VS Code caches the
  // per-id collapsible state, so merely setting Expanded on re-render doesn't
  // re-expand after a manual collapse — reveal() is the only reliable trigger.
  context.subscriptions.push(
    runner.onDidChangeState((actionId) => {
      if (!runner.isRunning(actionId)) {
        return;
      }
      const action = store.getById(actionId);
      if (!action) {
        return;
      }
      void treeView.reveal(
        { kind: "action", action },
        { expand: true, focus: false, select: false },
      );
    }),
  );

  // Keep the anyRunning context key in sync with the runner state.
  const updateAnyRunning = (): void => {
    void vscode.commands.executeCommand(
      "setContext",
      "claude-actions.anyRunning",
      runner.anyRunning(),
    );
  };
  updateAnyRunning();
  context.subscriptions.push(runner.onDidChangeState(() => {
    updateAnyRunning();
    // A run just finished — the cached version check may be stale if the user
    // updated claude externally. Re-check in the background.
    if (!runner.anyRunning()) {
      void versionChecker.refresh();
    }
  }));

  context.subscriptions.push(registerRunCommand(store, runner));
  context.subscriptions.push(registerStopCommand(runner));
  context.subscriptions.push(registerDeleteCommand(store, runner));
  context.subscriptions.push(registerRefreshCommand(store));
  context.subscriptions.push(registerInitWorkspaceCommand());
  for (const d of registerPinCommands(pins)) {
    context.subscriptions.push(d);
  }
  context.subscriptions.push(registerShowOutputCommand(logs));
  context.subscriptions.push(registerCreateCommand(store, logs));
  context.subscriptions.push(registerUpdateClaudeCommand(versionChecker));
  context.subscriptions.push(registerReviewFailureCommand(store, failureStatusBar, logs));

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(root, ".actions/*.md"),
  );
  context.subscriptions.push(watcher);
  const rescan = (): void => {
    store.rescan().catch((err) => log.appendLine(`[claude-actions] rescan failed: ${String(err)}`));
  };
  watcher.onDidCreate(rescan);
  watcher.onDidChange(rescan);
  watcher.onDidDelete(rescan);

  await store.rescan();
  log.appendLine(`[claude-actions] loaded ${store.getAll().length} action(s)`);

  // Kick off an initial version check in the background. The UI doesn't wait
  // on it — the update button simply appears when the network call completes
  // if an update is available.
  void versionChecker.refresh();
}

export function deactivate(): void {
  // Nothing yet — all resources are pushed to context.subscriptions.
}
