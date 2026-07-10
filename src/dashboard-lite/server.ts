import { createServer, type Server } from "http";
import { loadPipeline, isCorruptDataError } from "../storage/file-store.js";
import { renderLiteDashboard } from "./render.js";

/**
 * Zero-build "lite" dashboard server.
 *
 * A dependency-free Node HTTP server that, on every request, re-reads the
 * pipeline YAML from disk and renders it via renderLiteDashboard(). Nothing is
 * cached or prerendered — refreshing the page always reflects the current state
 * of ~/.career-compass, mirroring the force-dynamic guarantee of the Next.js
 * dashboard. Ships in the npm package (pure JS, no framework, no build).
 */
export function createLiteDashboardServer(): Server {
  return createServer(async (req, res) => {
    // Only serve the dashboard at "/"; everything else 404s (favicon, etc.).
    const path = (req.url ?? "/").split("?")[0];
    if (path !== "/" && path !== "/index.html") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    try {
      const pipeline = await loadPipeline();
      const html = renderLiteDashboard(pipeline);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        // Never cache: the whole point is a live read of local data.
        "cache-control": "no-store, must-revalidate",
      });
      res.end(html);
    } catch (err) {
      const corrupt = isCorruptDataError(err);
      const msg = corrupt
        ? `Your pipeline file exists but couldn't be parsed. Fix it or restore a .bak backup, then refresh.\n\n${(err as Error).message}`
        : `Failed to render dashboard: ${(err as Error)?.message ?? String(err)}`;
      res.writeHead(corrupt ? 422 : 500, { "content-type": "text/plain; charset=utf-8" });
      res.end(msg);
    }
  });
}

/** Start the lite dashboard on `port`, resolving once it's listening. */
export function startLiteDashboard(port: number, hostname = "localhost"): Promise<Server> {
  const server = createLiteDashboardServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => resolve(server));
  });
}
