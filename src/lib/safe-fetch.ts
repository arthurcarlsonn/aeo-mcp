import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const TIMEOUT_MS = 10000;
export const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 5;

declare const __PKG_VERSION__: string | undefined;
const VERSION = typeof __PKG_VERSION__ === "string" ? __PKG_VERSION__ : "dev";
const USER_AGENT = `aeo-mcp/${VERSION} (+https://github.com/arthurcarlsonn/aeo-mcp)`;

/**
 * Loopback is normally blocked with everything else. Integration tests set
 * AEO_MCP_UNSAFE_ALLOW_LOOPBACK=1 to reach local fixture servers; every other
 * private/special range stays blocked even then, so redirect re-validation
 * remains testable.
 */
function loopbackAllowed(): boolean {
  return process.env.AEO_MCP_UNSAFE_ALLOW_LOOPBACK === "1";
}

export class SafeFetchError extends Error {}

function isPrivateIPv4(ip: string): { private: boolean; loopback: boolean } {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {
    return { private: true, loopback: false };
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 127) return { private: true, loopback: true };
  if (a === 10) return { private: true, loopback: false };
  if (a === 172 && b >= 16 && b <= 31) return { private: true, loopback: false };
  if (a === 192 && b === 168) return { private: true, loopback: false };
  if (a === 169 && b === 254) return { private: true, loopback: false };
  if (a === 0) return { private: true, loopback: false };
  return { private: false, loopback: false };
}

function isPrivateIPv6(ip: string): { private: boolean; loopback: boolean } {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return { private: true, loopback: true };
  if (lower === "::" ) return { private: true, loopback: false };
  // fc00::/7 (unique local)
  if (/^f[cd]/.test(lower)) return { private: true, loopback: false };
  // fe80::/10 (link local)
  if (/^fe[89ab]/.test(lower)) return { private: true, loopback: false };
  // IPv4-mapped, dotted (::ffff:10.0.0.1) or hex (::ffff:a00:1) form —
  // the URL parser normalizes to the hex form, so both must be caught.
  const mapped = lower.match(/^::ffff:([0-9a-f:.]+)$/);
  if (mapped) {
    const rest = mapped[1]!;
    if (rest.includes(".")) return isPrivateIPv4(rest);
    const groups = rest.split(":");
    if (groups.length === 2) {
      const hi = parseInt(groups[0]!, 16);
      const lo = parseInt(groups[1]!, 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        return isPrivateIPv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
      }
    }
    return { private: true, loopback: false }; // unparseable mapped form: refuse
  }
  return { private: false, loopback: false };
}

function classifyAddress(ip: string): { private: boolean; loopback: boolean } {
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return { private: true, loopback: false };
}

/** Throws SafeFetchError when the URL points at a private or special address. */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError(`Blocked: only http and https URLs are allowed (got ${url.protocol})`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host.toLowerCase() === "localhost") {
    if (loopbackAllowed()) return url;
    throw new SafeFetchError("Blocked: URL resolves to a private address (localhost)");
  }

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      const results = await lookup(host, { all: true });
      addresses = results.map((r) => r.address);
    } catch {
      throw new SafeFetchError(`Fetch failed: could not resolve ${host}`);
    }
  }

  for (const address of addresses) {
    const verdict = classifyAddress(address);
    if (verdict.loopback && loopbackAllowed()) continue;
    if (verdict.private) {
      throw new SafeFetchError("Blocked: URL resolves to a private address");
    }
  }
  return url;
}

export interface SafeFetchResult {
  status: number;
  finalUrl: string;
  body: string;
  contentType: string;
}

/**
 * Fetch with the full SSRF guard: scheme + address validation on the initial
 * URL and again on every redirect hop, 10 s timeout, 2 MB body cap.
 */
export async function safeFetch(rawUrl: string): Promise<SafeFetchResult> {
  let current = (await assertPublicUrl(normalize(rawUrl))).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,text/plain,*/*" },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new SafeFetchError(`Fetch failed: ${current} timed out after ${TIMEOUT_MS} ms`);
      }
      throw new SafeFetchError(`Fetch failed: could not reach ${current}`);
    }

    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const loc = res.headers.get("location");
      res.body?.cancel().catch(() => {});
      if (!loc) throw new SafeFetchError(`Fetch failed: redirect from ${current} had no Location`);
      const next = new URL(loc, current).toString();
      await assertPublicUrl(next); // re-validate every hop
      current = next;
      continue;
    }

    try {
      const body = await readCapped(res, MAX_BODY_BYTES);
      return {
        status: res.status,
        finalUrl: current,
        body,
        contentType: res.headers.get("content-type") ?? "",
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new SafeFetchError(`Fetch failed: ${current} timed out after ${TIMEOUT_MS} ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new SafeFetchError(`Fetch failed: too many redirects (more than ${MAX_REDIRECTS})`);
}

export function normalize(input: string): string {
  const trimmed = input.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total >= maxBytes) {
      chunks.push(value.slice(0, value.byteLength - (total - maxBytes)));
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
