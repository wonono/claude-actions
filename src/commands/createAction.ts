import * as vscode from "vscode";
import { composeCreatePrompt } from "../claude/prompts/createTemplate";
import { spawnClaude } from "../claude/spawnClaude";
import { LogFactory } from "../util/log";
import { ensureActionsDir, getActionsDir, getWorkspaceRoot } from "../util/workspace";
import { looksLikeTrustError } from "../util/trustError";

export function registerCreateCommand(logs: LogFactory): vscode.Disposable {
  return vscode.commands.registerCommand("claude-actions.create", async () => {
    const root = getWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage("Open a folder before creating an action.");
      return;
    }

    const description = await vscode.window.showInputBox({
      prompt: "Describe the action to create (in English — Claude will write the file)",
      placeHolder: "e.g. Generate unit tests for the currently focused file",
      ignoreFocusOut: true,
    });
    if (!description || !description.trim()) {
      return;
    }

    await ensureActionsDir();
    const actionsDir = getActionsDir();
    if (!actionsDir) {
      return;
    }

    const existingBefore = await snapshotActionFiles(actionsDir);
    const channel = logs.forAction("(creation)", "Action Creation");
    channel.clear();
    channel.appendLine(`[claude-actions] creating a new action`);
    channel.appendLine(`[claude-actions] user description: ${description.trim()}`);

    let stderrBuf = "";

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Creating action…",
        cancellable: true,
      },
      (_progress, token) =>
        new Promise<void>((resolve) => {
          const handle = spawnClaude({
            cwd: root.fsPath,
            prompt: composeCreatePrompt(description),
            onStdoutChunk: (t) => channel.append(t),
            onStderrChunk: (t) => {
              channel.append(t);
              stderrBuf = (stderrBuf + t).slice(-4096);
            },
            onExit: async (code, signal) => {
              await handleCreationExit({
                code,
                signal,
                actionsDir,
                existingBefore,
                channel,
                stderrBuf,
              });
              resolve();
            },
            onError: (err) => {
              if (err.code === "ENOENT") {
                vscode.window.showErrorMessage(
                  "Claude CLI not found in PATH. See the README for setup.",
                );
              } else {
                vscode.window.showErrorMessage(`Failed to launch claude: ${err.message}`);
              }
              channel.appendLine(`[claude-actions] error: ${err.message}`);
              resolve();
            },
          });

          token.onCancellationRequested(() => {
            channel.appendLine(`[claude-actions] cancelled by user`);
            handle.kill();
          });
        }),
    );
  });
}

async function snapshotActionFiles(dir: vscode.Uri): Promise<Set<string>> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(dir);
    return new Set(
      entries
        .filter(([name, type]) => type === vscode.FileType.File && name.toLowerCase().endsWith(".md"))
        .map(([name]) => name),
    );
  } catch {
    return new Set();
  }
}

interface ExitContext {
  code: number | null;
  signal: NodeJS.Signals | null;
  actionsDir: vscode.Uri;
  existingBefore: Set<string>;
  channel: vscode.OutputChannel;
  stderrBuf: string;
}

async function handleCreationExit(ctx: ExitContext): Promise<void> {
  const { code, signal, actionsDir, existingBefore, channel, stderrBuf } = ctx;
  channel.appendLine(
    `\n[claude-actions] exit code=${code ?? "null"}${signal ? ` signal=${signal}` : ""}`,
  );

  if (signal === "SIGTERM" || signal === "SIGKILL") {
    vscode.window.setStatusBarMessage("Action creation cancelled", 3000);
    return;
  }

  const afterSnapshot = await snapshotActionFiles(actionsDir);
  const newFiles = [...afterSnapshot].filter((n) => !existingBefore.has(n));

  if (code === 0 && newFiles.length >= 1) {
    const name = newFiles[0];
    const choice = await vscode.window.showInformationMessage(
      `Action "${name}" created.`,
      "Open file",
    );
    if (choice === "Open file") {
      const fileUri = vscode.Uri.joinPath(actionsDir, name);
      await vscode.commands.executeCommand("vscode.open", fileUri);
    }
    return;
  }

  if (code === 0 && newFiles.length === 0) {
    const choice = await vscode.window.showWarningMessage(
      "Creation finished but no new action file was produced.",
      "Show output",
    );
    if (choice === "Show output") {
      channel.show(true);
    }
    return;
  }

  const buttons = looksLikeTrustError(stderrBuf)
    ? ["Show output", "Initialize workspace"]
    : ["Show output"];
  const choice = await vscode.window.showErrorMessage(
    `Action creation failed (exit ${code ?? "?"})`,
    ...buttons,
  );
  if (choice === "Show output") {
    channel.show(true);
  } else if (choice === "Initialize workspace") {
    await vscode.commands.executeCommand("claude-actions.initWorkspace");
  }
}
