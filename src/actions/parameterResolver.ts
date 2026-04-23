import * as vscode from "vscode";
import { ActionParameter, PickParameter } from "./ActionModel";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*\}\}/g;

/**
 * Prompts the user once per parameter in declaration order (QuickPick for
 * "pick", InputBox for "text") and returns a key→value map. Returns
 * `undefined` if the user cancels any step — the whole run aborts.
 */
export async function resolveParameters(
  params: readonly ActionParameter[],
  workspaceRoot: vscode.Uri,
): Promise<Map<string, string> | undefined> {
  const out = new Map<string, string>();
  for (const param of params) {
    const value = await resolveOne(param, workspaceRoot);
    if (value === undefined) {
      return undefined;
    }
    out.set(param.key, value);
  }
  return out;
}

async function resolveOne(
  param: ActionParameter,
  workspaceRoot: vscode.Uri,
): Promise<string | undefined> {
  if (param.kind === "text") {
    const prefill =
      param.defaultFrom === "activeFile" ? activeFileRelativePath() : undefined;
    return vscode.window.showInputBox({
      title: param.name,
      prompt: param.description,
      placeHolder: param.placeholder,
      value: prefill,
      ignoreFocusOut: true,
    });
  }
  return resolvePickParameter(param, workspaceRoot);
}

/**
 * Path of the focused editor, made relative to the workspace root for
 * portability. Returns undefined if no editor is focused or the active file
 * lives outside the workspace — in that case the InputBox opens empty rather
 * than pre-filling an absolute path that is rarely what the user wants.
 */
function activeFileRelativePath(): string | undefined {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (!active || active.scheme !== "file") {
    return undefined;
  }
  const rel = vscode.workspace.asRelativePath(active, false);
  // asRelativePath returns the original absolute path if the file is outside
  // every workspace folder — in that case we'd rather open the InputBox
  // empty than pre-fill an absolute path the user likely doesn't want.
  if (rel === active.fsPath) {
    return undefined;
  }
  return rel;
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

export function substituteParameters(
  body: string,
  values: ReadonlyMap<string, string>,
): string {
  return body.replace(PLACEHOLDER_RE, (match, key: string) => {
    const v = values.get(key);
    return v === undefined ? match : v;
  });
}

/**
 * Returns the set of placeholder keys actually referenced in the body (each
 * `{{key}}` occurrence). Useful for sanity-checking that declared parameters
 * are wired to the prompt.
 */
export function placeholderKeys(body: string): Set<string> {
  const keys = new Set<string>();
  for (const m of body.matchAll(PLACEHOLDER_RE)) {
    keys.add(m[1]);
  }
  return keys;
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
