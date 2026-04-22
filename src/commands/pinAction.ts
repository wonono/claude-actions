import * as vscode from "vscode";
import { Action } from "../actions/ActionModel";
import { PinStore } from "../actions/PinStore";

export function registerPinCommands(pins: PinStore): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("claude-actions.pin", async (target: unknown) => {
      const id = resolveId(target);
      if (!id) {
        return;
      }
      await pins.pin(id);
    }),
    vscode.commands.registerCommand("claude-actions.unpin", async (target: unknown) => {
      const id = resolveId(target);
      if (!id) {
        return;
      }
      await pins.unpin(id);
    }),
  ];
}

function resolveId(target: unknown): string | undefined {
  if (!target || typeof target !== "object") {
    return undefined;
  }
  const t = target as { kind?: string; action?: Action; id?: string };
  if (t.kind === "action" && t.action) {
    return t.action.id;
  }
  return typeof t.id === "string" ? t.id : undefined;
}
