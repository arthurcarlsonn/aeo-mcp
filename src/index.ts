import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SafeFetchError } from "./lib/safe-fetch.js";
import * as auditUrl from "./tools/audit-url.js";
import * as checkAiCrawlers from "./tools/check-ai-crawlers.js";
import * as extractPageSignals from "./tools/extract-page-signals.js";
import * as extractStructuredData from "./tools/extract-structured-data.js";
import * as inspectLlmsTxt from "./tools/inspect-llms-txt.js";

declare const __PKG_VERSION__: string | undefined;
const VERSION = typeof __PKG_VERSION__ === "string" ? __PKG_VERSION__ : "dev";

interface ToolModule {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: { url: string }): Promise<object>;
}

const tools: ToolModule[] = [
  auditUrl,
  checkAiCrawlers,
  inspectLlmsTxt,
  extractStructuredData,
  extractPageSignals,
];

export const server = new McpServer({ name: "aeo-mcp", version: VERSION });

for (const tool of tools) {
  server.registerTool(
    tool.name,
    // The SDK accepts zod raw shapes for inputSchema.
    { description: tool.description, inputSchema: tool.inputSchema as never },
    async (args: { url: string }) => {
      try {
        const result = await tool.run(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const message =
          err instanceof SafeFetchError
            ? err.message
            : err instanceof Error
              ? `Fetch failed: ${err.message}`
              : "Fetch failed: unknown error";
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout is the protocol channel; diagnostics go to stderr only.
console.error(`aeo-mcp v${VERSION} ready (stdio)`);
