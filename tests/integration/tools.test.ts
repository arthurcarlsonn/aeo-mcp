import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auditUrl from "../../src/tools/audit-url.js";
import * as checkAiCrawlers from "../../src/tools/check-ai-crawlers.js";
import * as extractPageSignals from "../../src/tools/extract-page-signals.js";
import * as extractStructuredData from "../../src/tools/extract-structured-data.js";
import * as inspectLlmsTxt from "../../src/tools/inspect-llms-txt.js";
import { SafeFetchError } from "../../src/lib/safe-fetch.js";
import { fixture } from "../helpers/fixtures.js";
import { serveRoutes, type TestSite } from "../helpers/server.js";

let site: TestSite | null = null;
beforeEach(() => {
  vi.stubEnv("AEO_MCP_UNSAFE_ALLOW_LOOPBACK", "1");
});
afterEach(async () => {
  await site?.close();
  site = null;
  vi.unstubAllEnvs();
});

async function perfectSite(): Promise<TestSite> {
  return serveRoutes({
    "/": { body: fixture("perfect.html") },
    "/robots.txt": { body: fixture("robots-allow.txt"), contentType: "text/plain" },
    "/llms.txt": { body: fixture("llms-valid.txt"), contentType: "text/plain" },
    "/sitemap.xml": {
      body: "<?xml version='1.0'?><urlset></urlset>",
      contentType: "application/xml",
    },
  });
}

describe("audit_url", () => {
  it("returns the PRD summary shape from a full audit", async () => {
    site = await perfectSite();
    const result = (await auditUrl.run({ url: site.url })) as {
      score: number;
      grade: string;
      categories: { id: string; score: number; max: number }[];
      failed: { id: string }[];
      warned: unknown[];
    };
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.categories.map((c) => c.max)).toEqual([30, 25, 25, 20]);
    // The only failure on a local http server is HTTPS (D5).
    expect(result.failed.map((f) => f.id)).toEqual(["D5"]);
  }, 20000);

  it("blocks private targets before auditing", async () => {
    await expect(auditUrl.run({ url: "http://10.0.0.1/" })).rejects.toThrow(/private address/);
  });
});

describe("check_ai_crawlers", () => {
  it("returns per-bot verdicts with matched rules", async () => {
    site = await serveRoutes({
      "/robots.txt": { body: fixture("robots-block-ai.txt"), contentType: "text/plain" },
    });
    const result = (await checkAiCrawlers.run({ url: site.url })) as {
      robotsTxtFound: boolean;
      bots: { bot: string; allowed: boolean; matchedRule: string | null }[];
    };
    expect(result.robotsTxtFound).toBe(true);
    const gpt = result.bots.find((b) => b.bot === "GPTBot")!;
    expect(gpt.allowed).toBe(false);
    expect(gpt.matchedRule).toContain("Disallow: /");
    const bing = result.bots.find((b) => b.bot === "Bingbot")!;
    expect(bing.allowed).toBe(true);
    expect(result.bots).toHaveLength(6);
  });

  it("treats a missing robots.txt as all-allowed", async () => {
    site = await serveRoutes({});
    const result = (await checkAiCrawlers.run({ url: site.url })) as {
      robotsTxtFound: boolean;
      bots: { allowed: boolean }[];
      sitemaps: string[];
    };
    expect(result.robotsTxtFound).toBe(false);
    expect(result.bots.every((b) => b.allowed)).toBe(true);
    expect(result.sitemaps).toEqual([]);
  });
});

describe("inspect_llms_txt", () => {
  it("parses a valid llms.txt", async () => {
    site = await perfectSite();
    const result = (await inspectLlmsTxt.run({ url: site.url })) as {
      found: boolean;
      valid: boolean;
      title: string;
    };
    expect(result.found).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.title).toBe("GlowLab");
  });

  it("reports a missing llms.txt without erroring", async () => {
    site = await serveRoutes({});
    const result = (await inspectLlmsTxt.run({ url: site.url })) as {
      found: boolean;
      issues: string[];
    };
    expect(result.found).toBe(false);
    expect(result.issues).toContain("No llms.txt found at /llms.txt");
  });
});

describe("extract_structured_data", () => {
  it("summarizes JSON-LD from a page", async () => {
    site = await perfectSite();
    const result = (await extractStructuredData.run({ url: site.url })) as {
      types: string[];
    };
    expect(result.types).toEqual(expect.arrayContaining(["Organization", "Product", "FAQPage"]));
  });

  it("returns a fetch error on non-200 pages", async () => {
    site = await serveRoutes({ "/": { status: 500, body: "boom" } });
    await expect(extractStructuredData.run({ url: site.url })).rejects.toThrow(
      SafeFetchError,
    );
  });
});

describe("extract_page_signals", () => {
  it("extracts signals from a page", async () => {
    site = await perfectSite();
    const result = (await extractPageSignals.run({ url: site.url })) as {
      h1: string;
      likelyClientRendered: boolean;
    };
    expect(result.h1).toBe("GlowLab Vitamin C Serum");
    expect(result.likelyClientRendered).toBe(false);
  });

  it("flags the SPA fixture", async () => {
    site = await serveRoutes({ "/": { body: fixture("spa.html") } });
    const result = (await extractPageSignals.run({ url: site.url })) as {
      likelyClientRendered: boolean;
    };
    expect(result.likelyClientRendered).toBe(true);
  });
});
