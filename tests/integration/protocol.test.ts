import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture } from "../helpers/fixtures.js";
import { serveRoutes, type TestSite } from "../helpers/server.js";

/**
 * Speaks the real stdio protocol against the built server:
 * initialize -> tools/list -> tools/call. Requires `npm run build` first
 * (CI builds before testing).
 */

const DIST = fileURLToPath(new URL("../../dist/index.js", import.meta.url));

let child: ChildProcess;
let site: TestSite;
let buffer = "";
const pending = new Map<number, (msg: unknown) => void>();

function send(msg: object): void {
  child.stdin!.write(JSON.stringify(msg) + "\n");
}

function request(id: number, method: string, params: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 15000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

beforeAll(async () => {
  if (!existsSync(DIST)) {
    throw new Error("dist/index.js not found — run `npm run build` before `npm test`");
  }
  site = await serveRoutes({
    "/robots.txt": { body: fixture("robots-block-ai.txt"), contentType: "text/plain" },
  });
  child = spawn(process.execPath, [DIST], {
    env: { ...process.env, AEO_MCP_UNSAFE_ALLOW_LOOPBACK: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout!.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as { id?: number };
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
      }
    }
  });
});

afterAll(async () => {
  child?.kill();
  await site?.close();
});

describe("stdio protocol round-trip", () => {
  it("initializes, lists 5 tools, and completes a tools/call", async () => {
    const init = (await request(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "protocol-test", version: "0.0.0" },
    })) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe("aeo-mcp");
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    const list = (await request(2, "tools/list", {})) as {
      result: { tools: { name: string; description: string; inputSchema: unknown }[] };
    };
    const names = list.result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "audit_url",
      "check_ai_crawlers",
      "extract_page_signals",
      "extract_structured_data",
      "inspect_llms_txt",
    ]);
    for (const tool of list.result.tools) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }

    const call = (await request(3, "tools/call", {
      name: "check_ai_crawlers",
      arguments: { url: site.url },
    })) as { result: { content: { type: string; text: string }[]; isError?: boolean } };
    expect(call.result.isError).toBeFalsy();
    const payload = JSON.parse(call.result.content[0]!.text) as {
      robotsTxtFound: boolean;
      bots: { bot: string; allowed: boolean }[];
    };
    expect(payload.robotsTxtFound).toBe(true);
    expect(payload.bots.find((b) => b.bot === "GPTBot")!.allowed).toBe(false);
  });

  it("returns isError for blocked private URLs", async () => {
    const call = (await request(4, "tools/call", {
      name: "extract_page_signals",
      arguments: { url: "http://192.168.0.1/" },
    })) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(call.result.isError).toBe(true);
    expect(call.result.content[0]!.text).toContain("private address");
  });
});
