import { describe, expect, it } from "vitest";
import { extractStructuredData } from "../../src/lib/jsonld.js";
import { parseLlmsTxt } from "../../src/lib/llmstxt.js";
import { parseRobots, verdictFor } from "../../src/lib/robots.js";
import { extractSignals } from "../../src/lib/signals.js";
import { fixture } from "../helpers/fixtures.js";

describe("robots verdicts", () => {
  it("reports the matched rule for a blocked bot", () => {
    const robots = parseRobots(fixture("robots-block-ai.txt"));
    const verdict = verdictFor(robots, "GPTBot");
    expect(verdict.allowed).toBe(false);
    expect(verdict.matchedRule).toBe("User-agent: gptbot / Disallow: /");
  });

  it("allows bots with no matching group and no rule", () => {
    const robots = parseRobots("User-agent: SomethingElse\nDisallow: /\n");
    expect(verdictFor(robots, "GPTBot")).toEqual({
      bot: "GPTBot",
      allowed: true,
      matchedRule: null,
    });
  });

  it("collects sitemap lines", () => {
    const robots = parseRobots(fixture("robots-allow.txt"));
    expect(robots.sitemaps).toEqual(["https://glowlab.example/sitemap.xml"]);
  });

  it("falls back to the wildcard group", () => {
    const robots = parseRobots(fixture("robots-blanket.txt"));
    const verdict = verdictFor(robots, "Bingbot");
    expect(verdict.allowed).toBe(false);
    expect(verdict.matchedRule).toContain("User-agent: *");
  });
});

describe("llms.txt parser", () => {
  it("parses title, summary, sections, and links", () => {
    const report = parseLlmsTxt(fixture("llms-valid.txt"));
    expect(report.found).toBe(true);
    expect(report.valid).toBe(true);
    expect(report.title).toBe("GlowLab");
    expect(report.summary).toContain("clinically tested");
    expect(report.sections).toHaveLength(1);
    expect(report.sections[0]!.heading).toBe("Key pages");
    expect(report.sections[0]!.links).toHaveLength(3);
    expect(report.sections[0]!.links[0]).toEqual({
      title: "Vitamin C Serum",
      url: "https://glowlab.example/serum",
    });
    expect(report.issues).toEqual([]);
  });

  it("flags a missing summary but stays valid", () => {
    const report = parseLlmsTxt(fixture("llms-no-summary.txt"));
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual(["Missing blockquote summary (expected '> one-line summary')"]);
  });

  it("marks unstructured text invalid with issues", () => {
    const report = parseLlmsTxt(fixture("llms-invalid.txt"));
    expect(report.valid).toBe(false);
    expect(report.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("handles a missing file", () => {
    const report = parseLlmsTxt(null);
    expect(report.found).toBe(false);
    expect(report.valid).toBe(false);
  });

  it("caps rawExcerpt at 2000 characters", () => {
    const long = "# Brand\n\n" + "x".repeat(5000);
    expect(parseLlmsTxt(long).rawExcerpt.length).toBe(2000);
  });
});

describe("structured data extractor", () => {
  it("flattens @graph and summarizes key fields per type", () => {
    const report = extractStructuredData(fixture("perfect.html"));
    expect(report.blocksFound).toBe(1);
    expect(report.parseErrors).toBe(0);
    expect(report.types).toEqual(
      expect.arrayContaining(["Organization", "Product", "FAQPage"]),
    );

    const product = report.nodes.find((n) => n.type === "Product")!;
    expect(product.keyFields).toEqual({
      name: "GlowLab Vitamin C Serum",
      price: "29.00",
      availability: "https://schema.org/InStock",
    });

    const org = report.nodes.find((n) => n.type === "Organization")!;
    expect(org.keyFields["logo"]).toBe("https://glowlab.example/logo.png");

    const faq = report.nodes.find((n) => n.type === "FAQPage")!;
    expect(faq.keyFields).toEqual({ questionCount: 2 });
  });

  it("counts parse errors on broken JSON-LD", () => {
    const report = extractStructuredData(fixture("broken.html"));
    expect(report.blocksFound).toBe(1);
    expect(report.parseErrors).toBe(1);
    expect(report.issues).toContain("1 JSON-LD block(s) failed to parse");
  });
});

describe("page signals", () => {
  it("extracts the full signal set from the perfect fixture", () => {
    const signals = extractSignals(fixture("perfect.html"));
    expect(signals.title).toContain("GlowLab");
    expect(signals.metaDescription).toContain("vitamin C");
    expect(signals.h1).toBe("GlowLab Vitamin C Serum");
    expect(signals.canonical).toBe("https://glowlab.example/serum");
    expect(signals.lang).toBe("en");
    expect(signals.textRatio).toBeGreaterThanOrEqual(0.1);
    expect(signals.likelyClientRendered).toBe(false);
    expect(signals.headingOutline[0]).toBe("h1: GlowLab Vitamin C Serum");
  });

  it("flags the SPA fixture as likely client-rendered", () => {
    const signals = extractSignals(fixture("spa.html"));
    expect(signals.likelyClientRendered).toBe(true);
    expect(signals.textRatio).toBeLessThan(0.04);
  });

  it("caps the heading outline at 30 entries", () => {
    const html = "<body>" + "<h2>Heading</h2>".repeat(50) + "</body>";
    expect(extractSignals(html).headingOutline).toHaveLength(30);
  });
});
