import matter from "gray-matter";

export type ParameterValuesSource =
  | { from: "static"; list: string[] }
  | { from: "directory"; path: string; mode: "dirs" | "files" };

export interface PickParameter {
  kind: "pick";
  name: string;
  description: string | undefined;
  multiple: boolean;
  values: ParameterValuesSource;
}

export interface TextParameter {
  kind: "text";
  name: string;
  description: string | undefined;
  placeholder: string | undefined;
}

export type ActionParameter = PickParameter | TextParameter;

export interface Action {
  id: string;
  name: string;
  description: string;
  icon: string;
  body: string;
  filePath: string;
  parameter: ActionParameter | undefined;
}

export interface ActionParseResult {
  action?: Action;
  warnings: string[];
}

const DEFAULT_ICON = "symbol-event";

function slugFromFilename(fileName: string): string {
  return fileName.replace(/\.md$/i, "").trim();
}

function isKebabCase(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}

function parseValuesSource(
  raw: unknown,
  warnings: string[],
): ParameterValuesSource | undefined {
  if (!raw || typeof raw !== "object") {
    warnings.push("parameter.values is missing or not an object");
    return undefined;
  }
  const v = raw as { from?: unknown; list?: unknown; path?: unknown; mode?: unknown };
  if (v.from === "static") {
    const list = Array.isArray(v.list)
      ? v.list.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)
      : [];
    if (list.length === 0) {
      warnings.push("parameter.values.list must be a non-empty array of strings");
      return undefined;
    }
    return { from: "static", list };
  }
  if (v.from === "directory") {
    const path = typeof v.path === "string" ? v.path.trim() : "";
    if (!path) {
      warnings.push("parameter.values.path is required for directory source");
      return undefined;
    }
    const mode: "dirs" | "files" = v.mode === "files" ? "files" : "dirs";
    return { from: "directory", path, mode };
  }
  warnings.push(`parameter.values.from must be "static" or "directory"`);
  return undefined;
}

function parseParameter(raw: unknown, warnings: string[]): ActionParameter | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "object") {
    warnings.push("parameter must be an object");
    return undefined;
  }
  const p = raw as {
    kind?: unknown;
    name?: unknown;
    description?: unknown;
    multiple?: unknown;
    values?: unknown;
    placeholder?: unknown;
  };
  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (!name) {
    warnings.push("parameter.name is required");
    return undefined;
  }
  const description = typeof p.description === "string" && p.description.trim()
    ? p.description.trim()
    : undefined;

  // kind defaults to "pick" for backward compatibility with actions written
  // before the text kind existed.
  const kind = p.kind === "text" ? "text" : "pick";

  if (kind === "text") {
    const placeholder = typeof p.placeholder === "string" && p.placeholder.trim()
      ? p.placeholder.trim()
      : undefined;
    return { kind: "text", name, description, placeholder };
  }

  const values = parseValuesSource(p.values, warnings);
  if (!values) {
    return undefined;
  }
  return {
    kind: "pick",
    name,
    description,
    multiple: Boolean(p.multiple),
    values,
  };
}

export function parseAction(raw: string, filePath: string, fileName: string): ActionParseResult {
  const warnings: string[] = [];
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (err) {
    warnings.push(`frontmatter parse error: ${String(err)}`);
    return { warnings };
  }

  const data = parsed.data ?? {};
  const body = parsed.content.trim();

  if (!body) {
    warnings.push("action body is empty");
    return { warnings };
  }

  const slug = slugFromFilename(fileName);
  let id = typeof data.id === "string" ? data.id.trim() : "";
  if (!id) {
    id = slug;
  } else if (!isKebabCase(id)) {
    warnings.push(`id "${id}" is not kebab-case — kept as-is but tooling may misbehave`);
  }

  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : slug;
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const icon = typeof data.icon === "string" && data.icon.trim() ? data.icon.trim() : DEFAULT_ICON;
  const parameter = parseParameter(data.parameter, warnings);

  return {
    action: { id, name, description, icon, body, filePath, parameter },
    warnings,
  };
}
