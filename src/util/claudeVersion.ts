import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { get as httpsGet } from "node:https";

const NPM_PACKAGE = "@anthropic-ai/claude-code";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const NETWORK_TIMEOUT_MS = 3000;

export interface VersionInfo {
  local: string | undefined;
  latest: string | undefined;
  updateAvailable: boolean;
  checkedAt: number;
}

export class ClaudeVersionChecker implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<VersionInfo>();
  readonly onDidChange = this._onDidChange.event;

  private cached: VersionInfo | undefined;

  constructor(private readonly log: vscode.OutputChannel) {}

  getInfo(): VersionInfo | undefined {
    return this.cached;
  }

  async refresh(options: { force?: boolean } = {}): Promise<VersionInfo> {
    if (!options.force && this.cached && Date.now() - this.cached.checkedAt < CACHE_TTL_MS) {
      return this.cached;
    }

    const [local, latest] = await Promise.all([
      this.readLocal().catch(() => undefined),
      this.fetchLatest().catch(() => undefined),
    ]);

    const updateAvailable = Boolean(local && latest && isOutdated(local, latest));
    const info: VersionInfo = { local, latest, updateAvailable, checkedAt: Date.now() };
    this.cached = info;
    await vscode.commands.executeCommand(
      "setContext",
      "claude-actions.updateAvailable",
      updateAvailable,
    );
    this.log.appendLine(
      `[version] local=${local ?? "?"} latest=${latest ?? "?"} updateAvailable=${updateAvailable}`,
    );
    this._onDidChange.fire(info);
    return info;
  }

  private readLocal(): Promise<string | undefined> {
    return new Promise((resolve) => {
      // shell: true is needed on Windows to execute the `claude.cmd` shim.
      execFile(
        "claude",
        ["--version"],
        { timeout: 5000, shell: process.platform === "win32" },
        (err, stdout) => {
          if (err) {
            resolve(undefined);
            return;
          }
          const match = stdout.match(/(\d+\.\d+\.\d+)/);
          resolve(match ? match[1] : undefined);
        },
      );
    });
  }

  private fetchLatest(): Promise<string | undefined> {
    return new Promise((resolve) => {
      const url = `https://registry.npmjs.org/${encodeURIComponent(NPM_PACKAGE)}/latest`;
      const req = httpsGet(url, { timeout: NETWORK_TIMEOUT_MS }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(undefined);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body) as { version?: string };
            resolve(typeof parsed.version === "string" ? parsed.version : undefined);
          } catch {
            resolve(undefined);
          }
        });
      });
      req.on("error", () => resolve(undefined));
      req.on("timeout", () => {
        req.destroy();
        resolve(undefined);
      });
    });
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

export function isOutdated(local: string, latest: string): boolean {
  const l = parseVersion(local);
  const r = parseVersion(latest);
  if (!l || !r) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
}

function parseVersion(s: string): [number, number, number] | undefined {
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) {
    return undefined;
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
