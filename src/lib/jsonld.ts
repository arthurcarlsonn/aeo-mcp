import * as cheerio from "cheerio";

export interface JsonLdNodeSummary {
  type: string;
  name: string | null;
  keyFields: Record<string, unknown>;
}

export interface JsonLdReport {
  blocksFound: number;
  parseErrors: number;
  types: string[];
  nodes: JsonLdNodeSummary[];
  issues: string[];
}

type Node = Record<string, unknown>;

function typesOf(node: Node): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function nameOf(node: Node): string | null {
  return str(node["name"]) ?? str(node["headline"]);
}

function keyFieldsFor(type: string, node: Node): Record<string, unknown> {
  switch (type) {
    case "Product": {
      const offersRaw = node["offers"];
      const offers = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as Node | undefined;
      return {
        name: nameOf(node),
        price: offers ? (offers["price"] ?? offers["lowPrice"] ?? null) : null,
        availability: offers ? (offers["availability"] ?? null) : null,
      };
    }
    case "Article":
    case "BlogPosting":
    case "NewsArticle": {
      const author = node["author"];
      const authorName =
        typeof author === "object" && author !== null
          ? str((author as Node)["name"])
          : str(author);
      return {
        headline: nameOf(node),
        datePublished: str(node["datePublished"]),
        author: authorName,
      };
    }
    case "FAQPage": {
      const main = node["mainEntity"];
      const questionCount = Array.isArray(main) ? main.length : main ? 1 : 0;
      return { questionCount };
    }
    case "Organization":
    case "WebSite": {
      const logo = node["logo"];
      return {
        name: str(node["name"]),
        url: str(node["url"]),
        logo: str(logo) ?? (typeof logo === "object" && logo !== null ? str((logo as Node)["url"]) : null),
      };
    }
    default:
      return { name: nameOf(node) };
  }
}

export function extractStructuredData(html: string): JsonLdReport {
  const $ = cheerio.load(html);
  const flat: Node[] = [];
  let blocksFound = 0;
  let parseErrors = 0;

  $('script[type="application/ld+json"]').each((_, el) => {
    blocksFound++;
    try {
      const parsed: unknown = JSON.parse($(el).text());
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        if (item && typeof item === "object") {
          const node = item as Node;
          flat.push(node);
          const graph = node["@graph"];
          if (Array.isArray(graph)) {
            for (const g of graph) {
              if (g && typeof g === "object") flat.push(g as Node);
            }
          }
        }
      }
    } catch {
      parseErrors++;
    }
  });

  const nodes: JsonLdNodeSummary[] = [];
  const typeSet = new Set<string>();
  for (const node of flat) {
    for (const type of typesOf(node)) {
      typeSet.add(type);
      nodes.push({ type, name: nameOf(node), keyFields: keyFieldsFor(type, node) });
    }
  }

  const issues: string[] = [];
  if (blocksFound === 0) issues.push("No JSON-LD blocks found");
  if (parseErrors > 0) issues.push(`${parseErrors} JSON-LD block(s) failed to parse`);
  if (blocksFound > 0 && nodes.length === 0 && parseErrors === 0) {
    issues.push("JSON-LD present but no typed nodes found");
  }

  return { blocksFound, parseErrors, types: [...typeSet], nodes, issues };
}
