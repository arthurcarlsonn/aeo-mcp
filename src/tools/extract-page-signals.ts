import { z } from "zod";
import { extractSignals } from "../lib/signals.js";
import { safeFetch, SafeFetchError, normalize } from "../lib/safe-fetch.js";

export const name = "extract_page_signals";

export const description =
  "Extract the on-page signals AI engines parse: title, meta description, h1, canonical, lang, " +
  "text-to-HTML ratio, heading outline, and whether the page looks client-side rendered (invisible " +
  "to most AI crawlers). Use to diagnose why engines misread or skip a page.";

export const inputSchema = {
  url: z.string().describe("Page URL to extract signals from"),
};

export async function run(args: { url: string }): Promise<object> {
  const res = await safeFetch(normalize(args.url));
  if (res.status < 200 || res.status >= 300) {
    throw new SafeFetchError(`Fetch failed: ${res.finalUrl} returned ${res.status}`);
  }
  return extractSignals(res.body);
}
