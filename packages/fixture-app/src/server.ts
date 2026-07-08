import { createServer, type Server } from "node:http";
import { renderPage, type Variant } from "./page";

export interface ApiCall {
  method: string;
  path: string;
}

export interface FixtureServer {
  server: Server;
  port: number;
  url: string;
  /** API calls the page (or an API-replay) made to `/api/*`, in order. */
  apiCalls: ApiCall[];
  close: () => Promise<void>;
}

/**
 * Start the fixture invoice app on `port` (0 = an ephemeral free port).
 * `GET /` serves variant "a"; `GET /?variant=b` serves the selector-shifted
 * variant used by the heal path.
 */
export function startFixtureServer(port = 0): Promise<FixtureServer> {
  const apiCalls: ApiCall[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Backend endpoints the page calls (GET search, POST approve, DELETE delete)
    // so there is real network traffic to capture — the method is the effect truth.
    if (url.pathname.startsWith("/api/")) {
      apiCalls.push({ method: req.method ?? "GET", path: url.pathname });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const variant: Variant = url.searchParams.get("variant") === "b" ? "b" : "a";
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderPage(variant));
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const boundPort = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        server,
        port: boundPort,
        url: `http://127.0.0.1:${boundPort}/`,
        apiCalls,
        close: () =>
          new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))),
      });
    });
  });
}

// Allow `node --experimental-strip-types src/server.ts` for manual use.
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? 5178);
  startFixtureServer(port).then((f) => {
    process.stdout.write(`fixture invoice app on ${f.url}\n`);
  });
}
