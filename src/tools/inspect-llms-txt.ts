import { z } from "zod";
import { parseLlmsTxt } from "../lib/llmstxt.js";
import { assertPublicUrl, normalize, safeFetch } from "../lib/safe-fetch.js";

export const name = "inspect_llms_txt";

export const description =
  "Fetch and validate a website's llms.txt file (the Markdown file that tells AI engines what " +
  "the site is about and which pages matter). Returns its title, summary, sections, links, and " +
  "any structural issues. Use when asked whether a site has llms.txt or how to improve it.";

export const inputSchema = {
  url: z.string().describe("Website URL, e.g. https://example.com (llms.txt is derived from it)"),
};

export async function run(args: { url: string }): Promise<object> {
  const url = await assertPublicUrl(normalize(args.url));

  let text: string | null = null;
  try {
    const res = await safeFetch(`${url.origin}/llms.txt`);
    const looksHtml = res.contentType.includes("text/html") || /^\s*</.test(res.body);
    if (res.status === 200 && res.body.trim() && !looksHtml) text = res.body;
  } catch {
    text = null;
  }

  return parseLlmsTxt(text);
}
