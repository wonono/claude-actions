import * as vscode from "vscode";

const ACTIONS_DIR_NAME = ".actions";

export function getWorkspaceRoot(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

export function getActionsDir(): vscode.Uri | undefined {
  const root = getWorkspaceRoot();
  return root ? vscode.Uri.joinPath(root, ACTIONS_DIR_NAME) : undefined;
}

export async function ensureActionsDir(): Promise<vscode.Uri | undefined> {
  const dir = getActionsDir();
  if (!dir) {
    return undefined;
  }
  try {
    await vscode.workspace.fs.createDirectory(dir);
  } catch (err) {
    // createDirectory is idempotent in the VS Code API — it returns without
    // error when the directory already exists. If we get here, it's a real
    // problem (permission denied, read-only FS, etc.).
    throw err;
  }
  return dir;
}

export async function setNoActionsContext(isEmpty: boolean): Promise<void> {
  await vscode.commands.executeCommand(
    "setContext",
    "claude-actions.noActions",
    isEmpty,
  );
}
