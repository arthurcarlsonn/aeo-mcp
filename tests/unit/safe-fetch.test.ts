import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertPublicUrl, safeFetch, SafeFetchError, normalize } from "../../src/lib/safe-fetch.js";
import { serveRoutes, type TestSite } from "../helpers/server.js";

let site: TestSite | null = null;
afterEach(async () => {
  await site?.close();
  site = null;
  vi.unstubAllEnvs();
});

describe("scheme rejection", () => {
  it.each(["ftp://example.com/file", "file:///etc/passwd", "javascript:alert(1)"])(
    "rejects %s",
    async (url) => {
      await expect(assertPublicUrl(url)).rejects.toThrow(/only http and https/);
    },
  );
});

describe("private address rejection (guard on)", () => {
  it("rejects localhost by hostname", async () => {
    await expect(assertPublicUrl("http://localhost:3000/")).rejects.toThrow(/private address/);
  });

  it.each([
    "http://127.0.0.1/",
    "http://127.8.8.8/",
    "http://10.0.0.1/",
    "http://172.16.5.5/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[fc00::1]/",
    "http://[fd12:3456::1]/",
    "http://[::ffff:10.0.0.1]/",
  ])("rejects %s", async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow(SafeFetchError);
  });

  it("accepts public addresses", async () => {
    await expect(assertPublicUrl("http://93.184.216.34/")).resolves.toBeInstanceOf(URL);
  });
});

describe("with the loopback test escape hatch", () => {
  beforeEach(() => {
    vi.stubEnv("AEO_MCP_UNSAFE_ALLOW_LOOPBACK", "1");
  });

  it("allows 127.0.0.1 but still blocks other private ranges", async () => {
    await expect(assertPublicUrl("http://127.0.0.1:9999/")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("http://10.0.0.1/")).rejects.toThrow(/private address/);
    await expect(assertPublicUrl("http://192.168.1.1/")).rejects.toThrow(/private address/);
  });

  it("re-validates redirects: hop to a private address is blocked", async () => {
    site = await serveRoutes({
      "/leak": { location: "http://10.255.255.1/internal", body: "" },
    });
    await expect(safeFetch(`${site.url}/leak`)).rejects.toThrow(/private address/);
  });

  it("follows safe redirects and returns the final URL", async () => {
    site = await serveRoutes({
      "/a": { location: "/b", body: "" },
      "/b": { body: "done" },
    });
    const res = await safeFetch(`${site.url}/a`);
    expect(res.body).toBe("done");
    expect(res.finalUrl).toBe(`${site.url}/b`);
  });

  it("caps bodies at 2 MB", async () => {
    site = await serveRoutes({
      "/big": { body: "x".repeat(3 * 1024 * 1024) },
    });
    const res = await safeFetch(`${site.url}/big`);
    expect(Buffer.byteLength(res.body)).toBe(2 * 1024 * 1024);
  });

  it("errors on redirect loops", async () => {
    site = await serveRoutes({ "/loop": { location: "/loop", body: "" } });
    await expect(safeFetch(`${site.url}/loop`)).rejects.toThrow(/too many redirects/);
  });
});

describe("timeout", () => {
  it("aborts slow responses with a clear error", async () => {
    vi.stubEnv("AEO_MCP_UNSAFE_ALLOW_LOOPBACK", "1");
    site = await serveRoutes({ "/slow": { body: "late", delayMs: 15000 } });
    await expect(safeFetch(`${site.url}/slow`)).rejects.toThrow(/timed out/);
  }, 20000);
});

describe("normalize", () => {
  it("assumes https when the protocol is missing", () => {
    expect(normalize("example.com")).toBe("https://example.com");
  });
  it("keeps explicit schemes for the guard to judge", () => {
    expect(normalize("ftp://example.com")).toBe("ftp://example.com");
  });
});
