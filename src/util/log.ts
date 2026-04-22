import * as vscode from "vscode";

export interface LogFactory {
  global: vscode.OutputChannel;
  forAction(id: string, name: string): vscode.OutputChannel;
  getExisting(id: string): vscode.OutputChannel | undefined;
  dispose(): void;
}

export function createLogFactory(): LogFactory {
  const global = vscode.window.createOutputChannel("Claude Actions");
  const perAction = new Map<string, vscode.OutputChannel>();

  return {
    global,
    forAction(id, name) {
      let channel = perAction.get(id);
      if (!channel) {
        channel = vscode.window.createOutputChannel(`Claude Actions: ${name}`);
        perAction.set(id, channel);
      }
      return channel;
    },
    getExisting(id) {
      return perAction.get(id);
    },
    dispose() {
      for (const channel of perAction.values()) {
        channel.dispose();
      }
      perAction.clear();
      global.dispose();
    },
  };
}
