import { z } from "zod";
import { parseRobots, verdictFor } from "../lib/robots.js";
import { assertPublicUrl, normalize, safeFetch } from "../lib/safe-fetch.js";

export const name = "check_ai_crawlers";

export const description =
  "Check whether AI crawlers like GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, and " +
  "Bingbot are allowed to read a website, based on its robots.txt. Use when asked about AI " +
  "visibility, AEO, crawler permissions, or why a site does not appear in ChatGPT or Perplexity.";

export const inputSchema = {
  url: z.string().describe("Website URL, e.g. https://example.com (robots.txt is derived from it)"),
};

const BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot", "Bingbot"];

export async function run(args: { url: string }): Promise<object> {
  const url = await assertPublicUrl(normalize(args.url));
  const robotsUrl = `${url.origin}/robots.txt`;

  let robotsTxt: string | null = null;
  try {
    const res = await safeFetch(robotsUrl);
    const looksHtml = res.contentType.includes("text/html") || /^\s*</.test(res.body);
    if (res.status === 200 && res.body.trim() && !looksHtml) robotsTxt = res.body;
  } catch {
    robotsTxt = null;
  }

  if (robotsTxt === null) {
    return {
      robotsTxtFound: false,
      bots: BOTS.map((bot) => ({ bot, allowed: true, matchedRule: null })),
      sitemaps: [],
    };
  }

  const robots = parseRobots(robotsTxt);
  return {
    robotsTxtFound: true,
    bots: BOTS.map((bot) => verdictFor(robots, bot, "/")),
    sitemaps: robots.sitemaps,
  };
}
