import { audit } from "answer-audit";
import { z } from "zod";
import { assertPublicUrl, normalize, TIMEOUT_MS } from "../lib/safe-fetch.js";

export const name = "audit_url";

export const description =
  "Run a full AI-readiness (AEO) audit of a website: 29 checks across AI crawler access, " +
  "structured data, content extractability, and answerability, returning a 0-100 score with " +
  "prioritized fixes. Use when asked how visible a site is to ChatGPT, Perplexity, Gemini, or " +
  "Claude, or for an overall AEO/AI-SEO health check.";

export const inputSchema = {
  url: z.string().describe("Website URL to audit, e.g. https://example.com"),
};

export async function run(args: { url: string }): Promise<object> {
  // The audit engine fetches on its own; the SSRF guard vets the URL first.
  const url = await assertPublicUrl(normalize(args.url));
  const result = await audit(url.toString(), { timeoutMs: TIMEOUT_MS });

  return {
    url: result.finalUrl,
    score: result.score,
    grade: result.grade,
    categories: result.categories.map((c) => ({
      id: c.id,
      score: Math.round(c.score),
      max: c.max,
    })),
    failed: result.checks
      .filter((c) => c.status === "fail")
      .map((c) => ({ id: c.id, message: c.message, ...(c.fix ? { fix: c.fix } : {}) })),
    warned: result.checks
      .filter((c) => c.status === "warn")
      .map((c) => ({ id: c.id, message: c.message, ...(c.fix ? { fix: c.fix } : {}) })),
  };
}
