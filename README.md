# aeo-mcp

An MCP server that gives AI agents — Claude, Claude Code, Cursor, anything speaking the Model Context Protocol — tools to inspect a website's visibility to AI answer engines. Crawler permissions, llms.txt, structured data, on-page signals, and a full 29-check AI-readiness audit (powered by [answer-audit](https://github.com/arthurcarlsonn/answer-audit)), each one tool call away. Read-only, no API keys, no telemetry.

## Install

**Claude Code**

```bash
claude mcp add aeo -- npx -y aeo-mcp
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{ "mcpServers": { "aeo": { "command": "npx", "args": ["-y", "aeo-mcp"] } } }
```

**Cursor** (`.cursor/mcp.json`)

```json
{ "mcpServers": { "aeo": { "command": "npx", "args": ["-y", "aeo-mcp"] } } }
```

## Tools

| Tool | When the agent uses it | Input | Returns |
|---|---|---|---|
| `audit_url` | "How visible is this site to ChatGPT/Perplexity?" — full AEO health check | `{ url }` | 0-100 score, grade, category breakdown, failed/warned checks with fixes |
| `check_ai_crawlers` | "Is GPTBot blocked?" — robots.txt policy per AI bot | `{ url }` | Per-bot allow/block verdicts with the matching rule, plus sitemaps |
| `inspect_llms_txt` | "Does this site have llms.txt? Is it valid?" | `{ url }` | Title, summary, sections with links, structural issues, raw excerpt |
| `extract_structured_data` | "What schema markup does this page have?" | `{ url }` | JSON-LD types, key fields per node, parse errors |
| `extract_page_signals` | "Why do engines misread this page?" | `{ url }` | Title, meta description, h1, canonical, lang, text ratio, heading outline, client-side-rendering flag |

Bots checked by `check_ai_crawlers`: GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Bingbot.

## Try these prompts

- "Audit glowlab.com and summarize the top 3 AEO fixes."
- "Compare the AI crawler policies of nike.com and adidas.com — who is more open to being cited?"
- "Check if my site has a valid llms.txt, and if not, draft one from my page signals."

## Security

The server fetches model-supplied URLs, so it ships with an SSRF guard: http/https only, DNS resolution checked against private and special ranges (loopback, RFC1918, link-local, unique-local, IPv4-mapped forms), re-validation on every redirect hop, 10 s timeout, 2 MB body cap, max 5 redirects. Violations return a clean tool error, never an exception. All tools are read-only and no LLM calls happen inside the server.

## Development

```bash
npm install
npm run build   # required before npm test (the protocol test runs dist/)
npm test
```

Tests include a scripted stdio round-trip (initialize → tools/list → tools/call) against the built server. To inspect interactively:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT © Arthur Carlson
