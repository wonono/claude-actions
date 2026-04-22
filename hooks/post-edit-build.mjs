#!/usr/bin/env node
// Post-edit auto-build hook — Node version (cross-platform).
//
// Reads the PostToolUse JSON envelope from Claude Code on stdin, decides
// whether the edit touches build-relevant paths, and if so: bumps patch,
// builds, packages, installs the .vsix, and cleans up older ones.
//
// Reentrance: guarded with hooks/.building. The bump itself mutates
// package.json, which is a watched path, but the guard prevents cascading.

import { existsSync, readFileSync, unlinkSync, writeFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const LOCK = join(REPO_ROOT, "hooks", ".building");
const IS_WIN = platform() === "win32";

process.chdir(REPO_ROOT);

function shouldSkipSilently() {
  if (existsSync(LOCK)) {
    return true;
  }
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    if (pkg.name !== "claude-actions") {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => resolve(buf));
    // Safety: if stdin stays open forever, fall through after 2s.
    setTimeout(() => resolve(buf), 2000);
  });
}

function normaliseRel(filePath) {
  if (!filePath) return undefined;
  const abs = resolve(filePath);
  if (abs.startsWith(REPO_ROOT)) {
    return abs.slice(REPO_ROOT.length + 1).split(/[\\/]/).join("/");
  }
  return filePath.split(/[\\/]/).join("/");
}

function isBuildRelevant(rel) {
  if (!rel) return false;
  // Ignore paths first — defense in depth.
  if (
    rel.startsWith(".actions/") ||
    rel.startsWith(".claude/") ||
    rel.startsWith("hooks/") ||
    rel.startsWith("dist/") ||
    rel.startsWith("node_modules/") ||
    rel.endsWith(".md")
  ) {
    return false;
  }
  // Build-relevant patterns.
  if (rel.startsWith("src/") && rel.endsWith(".ts")) return true;
  if (rel === "package.json") return true;
  if (rel === "tsconfig.json") return true;
  if (/^esbuild\.config\.(mjs|js|ts)$/.test(rel)) return true;
  return false;
}

function run(cmd, args, opts = {}) {
  const shell = IS_WIN; // on Windows, resolve .cmd/.bat/.exe via the shell
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: REPO_ROOT,
    shell,
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed with status ${result.status ?? "null"}`,
    );
  }
}

function resolveCodeBinary() {
  // Try 'code' on PATH first.
  try {
    const check = spawnSync(IS_WIN ? "where" : "which", ["code"], { shell: IS_WIN });
    if (check.status === 0) {
      return "code";
    }
  } catch {
    // fall through
  }
  if (IS_WIN) {
    return undefined; // fewer standard locations worth hardcoding
  }
  // macOS standard location.
  const mac = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
  if (existsSync(mac)) {
    return mac;
  }
  return undefined;
}

async function main() {
  if (shouldSkipSilently()) {
    process.exit(0);
  }

  const stdin = await readStdin();
  let filePath;
  try {
    const parsed = JSON.parse(stdin);
    filePath = parsed?.tool_input?.file_path;
  } catch {
    // No parseable payload — don't act.
    process.exit(0);
  }

  const rel = normaliseRel(filePath);
  if (!isBuildRelevant(rel)) {
    process.exit(0);
  }

  console.error(`[post-edit-build] triggered by ${rel}`);

  // Set lock + make sure we always clean up.
  writeFileSync(LOCK, "");
  const cleanup = () => {
    try {
      unlinkSync(LOCK);
    } catch {
      // ignore
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("uncaughtException", (err) => {
    cleanup();
    console.error(`[post-edit-build] error: ${err.message}`);
    process.exit(1);
  });

  try {
    run("npm", ["version", "patch", "--no-git-tag-version"]);
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    const version = pkg.version;
    console.error(`[post-edit-build] bumped to ${version}`);

    run("npm", ["run", "build"]);

    // Clean previous vsix files in dist/ before packaging the new one.
    const distDir = join(REPO_ROOT, "dist");
    if (existsSync(distDir)) {
      for (const name of readdirSync(distDir)) {
        if (/^claude-actions-.*\.vsix$/.test(name)) {
          try {
            unlinkSync(join(distDir, name));
          } catch {
            // ignore
          }
        }
      }
    }

    run("npx", ["--no-install", "@vscode/vsce", "package", "--out", "dist/", "--no-dependencies"]);

    const codeBin = resolveCodeBinary();
    if (codeBin) {
      run(codeBin, [
        "--install-extension",
        join("dist", `claude-actions-${version}.vsix`),
        "--force",
      ]);
    } else {
      console.error(
        "[post-edit-build] 'code' not found on PATH — packaged but not installed",
      );
    }

    console.error(`[post-edit-build] done v${version}`);
  } catch (err) {
    console.error(`[post-edit-build] ${err.message}`);
    process.exit(1);
  }
}

main();
