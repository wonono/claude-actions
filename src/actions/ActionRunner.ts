import * as vscode from "vscode";
import { ClaudeHandle, spawnClaude } from "../claude/spawnClaude";
import { composeRunPrompt } from "../claude/prompts/runTemplate";
import { looksLikeTrustError } from "../util/trustError";
import { LogFactory } from "../util/log";
import { Action } from "./ActionModel";

export type ActionState = "ready" | "in_progress";

export interface ActionFinishEvent {
  actionId: string;
  status: "done" | "failed";
  message?: string;
  endedAt: number;
  durationMs: number;
}

const PROGRESS_THROTTLE_MS = 500;

interface RunningEntry {
  handle: ClaudeHandle;
  channel: vscode.OutputChannel;
  stderrBuf: string;
  startedAt: number;
  lastLine: string | undefined;
  lastStdoutLine: string | undefined;
  progressDirty: boolean;
  progressTimer: NodeJS.Timeout | undefined;
}

export class ActionRunner implements vscode.Disposable {
  private readonly _onDidChangeState = new vscode.EventEmitter<string>();
  readonly onDidChangeState = this._onDidChangeState.event;

  private readonly _onProgress = new vscode.EventEmitter<string>();
  readonly onProgress = this._onProgress.event;

  private readonly _onDidFinish = new vscode.EventEmitter<ActionFinishEvent>();
  readonly onDidFinish = this._onDidFinish.event;

  private readonly running = new Map<string, RunningEntry>();
  private uptimeTicker: NodeJS.Timeout | undefined;

  constructor(private readonly logs: LogFactory, private readonly workspaceRoot: string) {}

  getState(actionId: string): ActionState {
    return this.running.has(actionId) ? "in_progress" : "ready";
  }

  isRunning(actionId: string): boolean {
    return this.running.has(actionId);
  }

  anyRunning(): boolean {
    return this.running.size > 0;
  }

  getLastLine(actionId: string): string | undefined {
    return this.running.get(actionId)?.lastLine;
  }

  getStartedAt(actionId: string): number | undefined {
    return this.running.get(actionId)?.startedAt;
  }

  start(action: Action, bodyOverride?: string): boolean {
    if (this.running.has(action.id)) {
      return false;
    }

    const channel = this.logs.forAction(action.id, action.name);
    channel.clear();
    channel.appendLine(`[claude-actions] starting "${action.name}" (${action.id})`);

    const body = bodyOverride ?? action.body;
    const entry: RunningEntry = {
      channel,
      stderrBuf: "",
      startedAt: Date.now(),
      lastLine: undefined,
      lastStdoutLine: undefined,
      progressDirty: false,
      progressTimer: undefined,
      handle: spawnClaude({
        cwd: this.workspaceRoot,
        prompt: composeRunPrompt(body),
        onStdoutChunk: (text) => channel.append(text),
        onStderrChunk: (text) => {
          channel.append(text);
          const e = this.running.get(action.id);
          if (e) {
            e.stderrBuf = (e.stderrBuf + text).slice(-4096);
          }
        },
        onStdoutLine: (line) => this.recordLine(action.id, line, "stdout"),
        onStderrLine: (line) => this.recordLine(action.id, line, "stderr"),
        onExit: (code, signal) => this.handleExit(action, code, signal),
        onError: (err) => this.handleError(action, err),
      }),
    };
    this.running.set(action.id, entry);
    this.ensureUptimeTicker();
    this._onDidChangeState.fire(action.id);
    return true;
  }

  private ensureUptimeTicker(): void {
    if (this.uptimeTicker) {
      return;
    }
    this.uptimeTicker = setInterval(() => {
      if (this.running.size === 0) {
        this.stopUptimeTicker();
        return;
      }
      for (const id of this.running.keys()) {
        this._onProgress.fire(id);
      }
    }, 1000);
  }

  private stopUptimeTicker(): void {
    if (this.uptimeTicker) {
      clearInterval(this.uptimeTicker);
      this.uptimeTicker = undefined;
    }
  }

  private recordLine(actionId: string, line: string, source: "stdout" | "stderr"): void {
    const entry = this.running.get(actionId);
    if (!entry) {
      return;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    entry.lastLine = trimmed;
    if (source === "stdout") {
      entry.lastStdoutLine = trimmed;
    }
    entry.progressDirty = true;
    if (entry.progressTimer) {
      return;
    }
    entry.progressTimer = setTimeout(() => {
      entry.progressTimer = undefined;
      if (!this.running.has(actionId)) {
        return;
      }
      if (!entry.progressDirty) {
        return;
      }
      entry.progressDirty = false;
      this._onProgress.fire(actionId);
    }, PROGRESS_THROTTLE_MS);
  }

  stop(actionId: string): void {
    const entry = this.running.get(actionId);
    if (!entry) {
      return;
    }
    entry.channel.appendLine(`[claude-actions] kill requested`);
    entry.handle.kill();
  }

  private handleExit(
    action: Action,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    const entry = this.running.get(action.id);
    if (entry?.progressTimer) {
      clearTimeout(entry.progressTimer);
    }
    this.running.delete(action.id);
    this._onDidChangeState.fire(action.id);

    const sig = signal ? ` signal=${signal}` : "";
    entry?.channel.appendLine(`[claude-actions] exit code=${code ?? "null"}${sig}`);

    const showOutput = (c: vscode.OutputChannel): void => c.show(true);
    const endedAt = Date.now();
    const durationMs = entry ? endedAt - entry.startedAt : 0;

    if (signal === "SIGTERM" || signal === "SIGKILL") {
      // User-initiated kill via the stop command — no error dialog, no last-run entry.
      vscode.window.setStatusBarMessage(`Action "${action.name}" stopped`, 3000);
      return;
    }

    if (code === 0) {
      // Exit 0 but the prompt contract requires claude to finish with either
      // "done" or "failed: <reason>". A "failed:" tail is a semantic failure
      // — treat it the same as a crashed run from the UI's perspective.
      const claudeFailure = parseClaudeFailure(entry?.lastStdoutLine);
      if (claudeFailure !== undefined) {
        this._onDidFinish.fire({
          actionId: action.id,
          status: "failed",
          message: claudeFailure || "claude reported failure",
          endedAt,
          durationMs,
        });
        vscode.window
          .showErrorMessage(
            `Action "${action.name}" reported failure: ${claudeFailure || "(no reason)"}`,
            "Show output",
          )
          .then((choice) => {
            if (choice === "Show output" && entry) {
              showOutput(entry.channel);
            }
          });
        return;
      }
      this._onDidFinish.fire({
        actionId: action.id,
        status: "done",
        endedAt,
        durationMs,
      });
      vscode.window
        .showInformationMessage(`Action "${action.name}" completed`, "Show output")
        .then((choice) => {
          if (choice === "Show output" && entry) {
            showOutput(entry.channel);
          }
        });
    } else {
      const stderr = entry?.stderrBuf ?? "";
      const tail = lastNonEmptyLine(stderr);
      this._onDidFinish.fire({
        actionId: action.id,
        status: "failed",
        message: tail ?? `exit ${code ?? "?"}`,
        endedAt,
        durationMs,
      });
      const actions = looksLikeTrustError(stderr)
        ? ["Show output", "Initialize workspace"]
        : ["Show output"];
      vscode.window
        .showErrorMessage(
          `Action "${action.name}" failed (exit ${code ?? "?"})`,
          ...actions,
        )
        .then((choice) => {
          if (choice === "Show output" && entry) {
            showOutput(entry.channel);
          } else if (choice === "Initialize workspace") {
            vscode.commands.executeCommand("claude-actions.initWorkspace");
          }
        });
    }
  }

  private handleError(action: Action, err: NodeJS.ErrnoException): void {
    const entry = this.running.get(action.id);
    if (entry?.progressTimer) {
      clearTimeout(entry.progressTimer);
    }
    this.running.delete(action.id);
    this._onDidChangeState.fire(action.id);

    entry?.channel.appendLine(`[claude-actions] spawn error: ${err.code ?? ""} ${err.message}`);

    const endedAt = Date.now();
    const durationMs = entry ? endedAt - entry.startedAt : 0;
    const message =
      err.code === "ENOENT" ? "claude CLI not found" : err.message || String(err.code ?? "spawn error");
    this._onDidFinish.fire({
      actionId: action.id,
      status: "failed",
      message,
      endedAt,
      durationMs,
    });

    if (err.code === "ENOENT") {
      vscode.window.showErrorMessage(
        "Claude CLI not found in PATH. See the README for setup instructions.",
      );
    } else {
      vscode.window.showErrorMessage(
        `Failed to launch claude: ${err.message}`,
      );
    }
  }

  getChannel(actionId: string): vscode.OutputChannel | undefined {
    return this.running.get(actionId)?.channel;
  }

  dispose(): void {
    for (const [, entry] of this.running) {
      if (entry.progressTimer) {
        clearTimeout(entry.progressTimer);
      }
      entry.handle.kill();
    }
    this.running.clear();
    this.stopUptimeTicker();
    this._onDidChangeState.dispose();
    this._onProgress.dispose();
    this._onDidFinish.dispose();
  }
}

function lastNonEmptyLine(s: string): string | undefined {
  const lines = s.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

// Contract from RUN_SYSTEM_PROMPT: final stdout line is "done" or
// "failed: <reason>". Returns the reason (possibly empty) when the marker
// matches, or undefined when the line looks like success / unknown.
function parseClaudeFailure(lastLine: string | undefined): string | undefined {
  if (!lastLine) {
    return undefined;
  }
  const m = lastLine.match(/^failed\s*:?\s*(.*)$/i);
  if (!m) {
    return undefined;
  }
  return m[1].trim();
}
