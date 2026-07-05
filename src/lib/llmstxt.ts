/** llms.txt structural parser: title, blockquote summary, sections with links. */

export interface LlmsLink {
  title: string;
  url: string;
}

export interface LlmsSection {
  heading: string;
  links: LlmsLink[];
}

export interface LlmsTxtReport {
  found: boolean;
  valid: boolean;
  title: string | null;
  summary: string | null;
  sections: LlmsSection[];
  issues: string[];
  rawExcerpt: string;
}

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g;

export function parseLlmsTxt(text: string | null): LlmsTxtReport {
  if (text === null) {
    return {
      found: false,
      valid: false,
      title: null,
      summary: null,
      sections: [],
      issues: ["No llms.txt found at /llms.txt"],
      rawExcerpt: "",
    };
  }

  const issues: string[] = [];
  const lines = text.split(/\r?\n/);

  let title: string | null = null;
  let summary: string | null = null;
  const sections: LlmsSection[] = [];
  // Links before any ## heading land in an implicit section.
  let current: LlmsSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (title === null && /^#\s+\S/.test(trimmed)) {
      title = trimmed.replace(/^#\s+/, "");
      continue;
    }
    if (summary === null && /^>\s*\S/.test(trimmed)) {
      summary = trimmed.replace(/^>\s*/, "");
      continue;
    }
    if (/^##\s+\S/.test(trimmed)) {
      current = { heading: trimmed.replace(/^##\s+/, ""), links: [] };
      sections.push(current);
      continue;
    }
    for (const m of trimmed.matchAll(LINK_RE)) {
      if (!current) {
        current = { heading: "", links: [] };
        sections.push(current);
      }
      current.links.push({ title: m[1]!, url: m[2]! });
    }
  }

  const linkCount = sections.reduce((n, s) => n + s.links.length, 0);
  if (title === null) issues.push("Missing H1 title line (expected '# Your brand')");
  if (summary === null) issues.push("Missing blockquote summary (expected '> one-line summary')");
  if (linkCount === 0) issues.push("No Markdown links to key pages found");

  return {
    found: true,
    valid: title !== null && linkCount > 0,
    title,
    summary,
    sections,
    issues,
    rawExcerpt: text.slice(0, 2000),
  };
}
