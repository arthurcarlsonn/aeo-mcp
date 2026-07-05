# NOTES

Assumptions made while building, per the operating rules.

## Spec interpretation

- **answer-audit is published** (verified with `npm view answer-audit` → 1.0.0), so `audit_url` is a thin adapter over its `audit()` export rather than a reimplemented check set, per the PRD's audit logic note.
- **Node floor is 20, not 18.** answer-audit requires >= 20 (its cheerio/undici chain needs the `File` global), and this package depends on it. Recorded deviation, same as project 01.
- **audit_url and the SSRF guard.** answer-audit fetches on its own without an SSRF guard, so `audit_url` validates the URL (scheme + DNS + private ranges) before delegating. Redirect hops *inside* the audit engine are not re-validated — the other four tools use `safeFetch` with per-hop re-validation. Accepted v1 trade-off, documented here.
- **DNS rebinding TOCTOU.** The guard validates addresses via `dns.lookup` before fetching; the fetch performs its own resolution, so a fast-flux DNS could in theory pass validation then rebind. Fixing this requires pinning the socket to the validated IP, which native fetch does not expose. Accepted v1 limitation, standard for this class of tool.
- **Loopback test escape hatch.** Integration tests must reach fixture servers on 127.0.0.1, which the guard correctly blocks. `AEO_MCP_UNSAFE_ALLOW_LOOPBACK=1` permits loopback only; every other private range stays blocked even with the flag, which is what makes the redirect-re-validation test possible (127.0.0.1 server redirecting to 10.x is still rejected).
- **Phase 4 protocol check** is implemented as the scripted stdio test the spec offers as the non-interactive alternative (`tests/integration/protocol.test.ts`): initialize, tools/list (asserts all 5 tools + schemas), tools/call round-trip, and an isError path. It runs against `dist/`, so `npm run build` must precede `npm test` (CI does this).
- **`sections` in inspect_llms_txt**: links that appear before any `##` heading are grouped into an implicit section with an empty heading, so no link is silently dropped.
- **robots.txt served as HTML** (error pages) is treated as missing, matching answer-audit's behavior.

## Left for Arthur (from the PRD)

1. Screenshot a real Claude Desktop / Claude Code tool-call session for the README.
2. Submit to the MCP registry, PulseMCP, awesome-mcp-servers.
3. Launch post with a short video.
