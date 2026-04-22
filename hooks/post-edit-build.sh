#!/usr/bin/env bash
# Post-edit auto-build hook.
# Reads the PostToolUse JSON envelope from Claude Code on stdin, decides whether
# the edit touches build-relevant paths, and if so: bumps patch, builds,
# packages, installs the .vsix, and cleans up older ones.
#
# Reentrance: we guard with hooks/.building. The bump itself mutates
# package.json, which is a watched path, but the guard prevents cascading.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

LOCK="$REPO_ROOT/hooks/.building"
if [ -f "$LOCK" ]; then
  exit 0
fi

# Sanity: only run in this repo.
if ! grep -q '"name": "claude-actions"' package.json 2>/dev/null; then
  exit 0
fi

# Read JSON envelope from stdin and extract the file_path.
payload="$(cat)"
file_path="$(
  printf '%s' "$payload" \
    | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(s);const p=j.tool_input&&j.tool_input.file_path;if(p)process.stdout.write(p);}catch{}});' \
    2>/dev/null || true
)"

if [ -z "$file_path" ]; then
  exit 0
fi

# Normalise to a workspace-relative path when possible.
rel="${file_path#$REPO_ROOT/}"

# Build-relevant paths.
case "$rel" in
  src/*.ts | src/**/*.ts | package.json | tsconfig.json | esbuild.config.*)
    ;;
  *)
    # Also match src/*/*.ts via pattern via a second case (bash doesn't deep-glob in case).
    case "$rel" in
      src/*.ts) ;;
      src/*/*.ts) ;;
      src/*/*/*.ts) ;;
      src/*/*/*/*.ts) ;;
      package.json | tsconfig.json) ;;
      esbuild.config.mjs | esbuild.config.js | esbuild.config.ts) ;;
      *) exit 0 ;;
    esac
    ;;
esac

# Ignored paths (defense in depth).
case "$rel" in
  .actions/* | .claude/* | hooks/* | dist/* | node_modules/* | *.md)
    exit 0
    ;;
esac

trap 'rm -f "$LOCK"' EXIT
: > "$LOCK"

echo "[post-edit-build] triggered by $rel" >&2

npm version patch --no-git-tag-version >/dev/null
VERSION="$(node -p 'require("./package.json").version')"
echo "[post-edit-build] bumped to $VERSION" >&2

npm run build >&2

# Clean prior vsix files, then package.
find dist -maxdepth 1 -name 'claude-actions-*.vsix' -delete 2>/dev/null || true
npx --no-install @vscode/vsce package --out dist/ --no-dependencies >&2

# Install into the primary VS Code app. If `code` is on PATH we use it;
# otherwise fall back to the standard macOS install location.
CODE_BIN=""
if command -v code >/dev/null 2>&1; then
  CODE_BIN="code"
elif [ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]; then
  CODE_BIN="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
fi

if [ -n "$CODE_BIN" ]; then
  "$CODE_BIN" --install-extension "dist/claude-actions-$VERSION.vsix" --force >&2 || {
    echo "[post-edit-build] install failed (extension packaged at dist/claude-actions-$VERSION.vsix)" >&2
    exit 1
  }
else
  echo "[post-edit-build] 'code' not in PATH — packaged at dist/claude-actions-$VERSION.vsix but not installed" >&2
fi

echo "[post-edit-build] done v$VERSION" >&2
