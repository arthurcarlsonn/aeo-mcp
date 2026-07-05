import { z } from "zod";
import { extractStructuredData } from "../lib/jsonld.js";
import { safeFetch, SafeFetchError, normalize } from "../lib/safe-fetch.js";

export const name = "extract_structured_data";

export const description =
  "Extract and summarize a page's JSON-LD structured data (schema.org): which types exist " +
  "(Product, Article, FAQPage, Organization), their key fields, and any parse errors. Use when " +
  "asked whether a page has the schema markup AI answer engines rely on for citations.";

export const inputSchema = {
  url: z.string().describe("Page URL to extract structured data from"),
};

export async function run(args: { url: string }): Promise<object> {
  const res = await safeFetch(normalize(args.url));
  if (res.status < 200 || res.status >= 300) {
    throw new SafeFetchError(`Fetch failed: ${res.finalUrl} returned ${res.status}`);
  }
  return extractStructuredData(res.body);
}
