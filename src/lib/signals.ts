import * as cheerio from "cheerio";

export interface PageSignals {
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  canonical: string | null;
  lang: string | null;
  textRatio: number;
  headingOutline: string[];
  likelyClientRendered: boolean;
}

const MAX_OUTLINE = 30;

export function extractSignals(html: string): PageSignals {
  const $ = cheerio.load(html);

  const clone = $.root().clone();
  clone.find("script, style, noscript, svg, template").remove();
  const text = clone.text().replace(/\s+/g, " ").trim();
  const htmlBytes = Buffer.byteLength(html, "utf8");
  const ratio = htmlBytes === 0 ? 0 : Buffer.byteLength(text, "utf8") / htmlBytes;

  const outline: string[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    if (outline.length >= MAX_OUTLINE) return;
    const tag = (el as { tagName: string }).tagName.toLowerCase();
    const heading = $(el).text().replace(/\s+/g, " ").trim();
    if (heading) outline.push(`${tag}: ${heading}`);
  });

  const val = (s: string | undefined) => {
    const t = (s ?? "").trim();
    return t ? t : null;
  };

  return {
    title: val($("head title").first().text()),
    metaDescription: val($('meta[name="description"]').attr("content")),
    h1: val($("h1").first().text()?.replace(/\s+/g, " ")),
    canonical: val($('link[rel="canonical"]').attr("href")),
    lang: val($("html").attr("lang")),
    textRatio: Math.round(ratio * 1000) / 1000,
    headingOutline: outline,
    likelyClientRendered: ratio < 0.04,
  };
}
