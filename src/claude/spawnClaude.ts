import { ChildProcess, spawn } from "node:child_process";

export interface SpawnOptions {
  cwd: string;
  prompt: string;
  onStdoutChunk?: (text: string) => void;
  onStderrChunk?: (text: string) => void;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  onError: (err: NodeJS.ErrnoException) => void;
}

export interface ClaudeHandle {
  child: ChildProcess;
  kill(): void;
}

const SIGKILL_ESCALATION_MS = 2000;

export function spawnClaude(opts: SpawnOptions): ClaudeHandle {
  const child = spawn("claude", ["-p", "--dangerously-skip-permissions"], {
    cwd: opts.cwd,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    // On Windows, `claude` is a .cmd shim; Node's spawn refuses to execute
    // .cmd/.bat without going through the shell. Argv is a fixed array (no
    // user content — the prompt travels via stdin), so shell: true is safe.
    shell: process.platform === "win32",
  });

  // Line buffering: emit complete lines. The trailing unterminated fragment
  // is intentionally withheld — the progress feature cares about complete lines
  // only. Raw chunks still reach onStdoutChunk for full output channel capture.
  const makeLineEmitter = (onLine: (line: string) => void) => {
    let buf = "";
    return (chunk: Buffer): void => {
      buf += chunk.toString("utf8");
      let idx = buf.indexOf("\n");
      while (idx !== -1) {
        const line = buf.slice(0, idx).replace(/\r$/, "");
        buf = buf.slice(idx + 1);
        if (line.length > 0) {
          onLine(line);
        }
        idx = buf.indexOf("\n");
      }
    };
  };

  if (child.stdout) {
    const lineEmit = opts.onStdoutLine ? makeLineEmitter(opts.onStdoutLine) : undefined;
    child.stdout.on("data", (chunk: Buffer) => {
      opts.onStdoutChunk?.(chunk.toString("utf8"));
      lineEmit?.(chunk);
    });
  }

  if (child.stderr) {
    const lineEmit = opts.onStderrLine ? makeLineEmitter(opts.onStderrLine) : undefined;
    child.stderr.on("data", (chunk: Buffer) => {
      opts.onStderrChunk?.(chunk.toString("utf8"));
      lineEmit?.(chunk);
    });
  }

  let killTimer: NodeJS.Timeout | undefined;
  let errored = false;

  child.on("error", (err: NodeJS.ErrnoException) => {
    errored = true;
    if (killTimer) {
      clearTimeout(killTimer);
      killTimer = undefined;
    }
    opts.onError(err);
  });

  child.on("exit", (code, signal) => {
    if (killTimer) {
      clearTimeout(killTimer);
      killTimer = undefined;
    }
    if (!errored) {
      opts.onExit(code, signal);
    }
  });

  // Write the composed prompt via stdin (cf. CLAUDE.md). If the child errored
  // synchronously (e.g. ENOENT fired from spawn), stdin may be undefined.
  if (child.stdin) {
    child.stdin.on("error", () => {
      // Swallow EPIPE: the child can close stdin before we finish writing.
    });
    child.stdin.end(opts.prompt);
  }

  return {
    child,
    kill(): void {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, SIGKILL_ESCALATION_MS);
    },
  };
}
