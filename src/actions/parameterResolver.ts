import * as vscode from "vscode";
import { ActionParameter, PickParameter } from "./ActionModel";

const PLACEHOLDER = /\{\{\s*parameter\s*\}\}/g;

/**
 * Prompts the user for the parameter value via the appropriate UI (QuickPick
 * for "pick", InputBox for "text") and returns the final value to substitute
 * into the prompt body. Returns `undefined` if the user cancelled, or if no
 * values are available (notification shown).
 */
export async function resolveParameter(
  param: ActionParameter,
  workspaceRoot: vscode.Uri,
): Promise<string | undefined> {
  if (param.kind === "text") {
    const value = await vscode.window.showInputBox({
      title: param.name,
      prompt: param.description,
      placeHolder: param.placeholder,
      ignoreFocusOut: true,
    });
    return value;
  }
  return resolvePickParameter(param, workspaceRoot);
}

async function resolvePickParameter(
  param: PickParameter,
  workspaceRoot: vscode.Uri,
): Promise<string | undefined> {
  const values = await gatherValues(param, workspaceRoot);
  if (values.length === 0) {
    vscode.window.showErrorMessage(
      `No values available for parameter "${param.name}" — check the action's ${describeSource(param)}.`,
    );
    return undefined;
  }

  const placeHolder = param.description ?? `Select ${param.name.toLowerCase()}`;

  if (param.multiple) {
    const picked = await vscode.window.showQuickPick(values, {
      canPickMany: true,
      title: param.name,
      placeHolder,
      ignoreFocusOut: true,
    });
    if (!picked || picked.length === 0) {
      return undefined;
    }
    return picked.join(", ");
  }

  const picked = await vscode.window.showQuickPick(values, {
    canPickMany: false,
    title: param.name,
    placeHolder,
    ignoreFocusOut: true,
  });
  return picked ?? undefined;
}

export function substituteParameter(body: string, value: string): string {
  return body.replace(PLACEHOLDER, value);
}

export function hasPlaceholder(body: string): boolean {
  return PLACEHOLDER.test(body);
}

async function gatherValues(
  param: PickParameter,
  workspaceRoot: vscode.Uri,
): Promise<string[]> {
  if (param.values.from === "static") {
    return [...param.values.list];
  }
  const dirUri = vscode.Uri.joinPath(workspaceRoot, param.values.path);
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dirUri);
  } catch {
    return [];
  }
  const wantedType =
    param.values.mode === "files" ? vscode.FileType.File : vscode.FileType.Directory;
  return entries
    .filter(([, type]) => type === wantedType)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
}

function describeSource(param: PickParameter): string {
  if (param.values.from === "static") {
    return "static values list";
  }
  return `directory \`${param.values.path}\``;
}
