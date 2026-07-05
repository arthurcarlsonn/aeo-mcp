import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface Route {
  status?: number;
  body: string;
  contentType?: string;
  /** Redirect target; when set, status defaults to 301. */
  location?: string;
  delayMs?: number;
}

export interface TestSite {
  server: Server;
  url: string;
  close(): Promise<void>;
}

export async function serveRoutes(routes: Record<string, Route>): Promise<TestSite> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const route = routes[path];
    if (!route) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    const respond = () => {
      if (route.location) {
        res.writeHead(route.status ?? 301, { location: route.location });
        res.end();
        return;
      }
      res.writeHead(route.status ?? 200, {
        "content-type": route.contentType ?? "text/html; charset=utf-8",
      });
      res.end(route.body);
    };
    if (route.delayMs) setTimeout(respond, route.delayMs);
    else respond();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
