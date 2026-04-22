import matter from "gray-matter";

export interface Action {
  id: string;
  name: string;
  description: string;
  icon: string;
  body: string;
  filePath: string;
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

  return {
    action: { id, name, description, icon, body, filePath },
    warnings,
  };
}
