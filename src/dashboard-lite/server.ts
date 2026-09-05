import { createServer, type Server } from "http";
import { existsSync } from "fs";
import { join } from "path";
import { getDataDir, loadPipeline, isCorruptDataError } from "../storage/file-store.js";
import { renderLiteDashboard } from "./render.js";
import { ALLOWED_HOSTNAMES, LOOPBACK, isAllowedHost, refusalBody } from "../loopback-guard.js";

export { ALLOWED_HOSTNAMES, isAllowedHost, hostnameOf } from "../loopback-guard.js";

/**
 * Zero-build "lite" dashboard server.
 *
 * A dependency-free Node HTTP server that, on every request, re-reads the
 * pipeline YAML from disk and renders it via renderLiteDashboard(). Nothing is
 * cached or prerendered — refreshing the page always reflects the current state
 * of ~/.career-compass, mirroring the force-dynamic guarantee of the Next.js
 * dashboard. Ships in the npm package (pure JS, no framework, no build).
 *
 * The DNS-rebinding defense it applies below is no longer defined here: it moved
 * to `../loopback-guard.js` so the Next dashboard — which renders far more than
 * this one does, and can write — imports the same code instead of going
 * unguarded. The names are re-exported above because this module's tests have
 * always reached them through this path.
 */
export function createLiteDashboardServer(): Server {
  return createServer(async (req, res) => {
    // Checked before anything else, including the path: a rejected origin must
    // not learn which paths exist or how the server responds to them.
    if (!isAllowedHost(req.headers.host)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end(refusalBody(req.headers.host));
      return;
    }
    // Only serve the dashboard at "/"; everything else 404s (favicon, etc.).
    const path = (req.url ?? "/").split("?")[0];
    if (path !== "/" && path !== "/index.html") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    try {
      const pipeline = await loadPipeline();
      const dataDir = getDataDir();
      const hasCareerKB = existsSync(join(dataDir, "career", "profile.yaml"));
      const html = renderLiteDashboard(pipeline, dataDir, new Date(), hasCareerKB);
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

/**
 * Start the lite dashboard on `port`, resolving once it's listening.
 *
 * Binds the literal IPv4 loopback rather than the name "localhost". Passing a
 * name lets Node resolve it, and on Windows that returns `::1` first — so the
 * server bound IPv6-only, and every client that tried `127.0.0.1` got
 * ECONNREFUSED while the CLI cheerfully printed a `http://localhost` URL that
 * happened to work on the author's machine. Which of the two a given browser
 * picks is not something we get to decide, so binding the name is a coin flip
 * on someone else's computer.
 *
 * `127.0.0.1` is the address every client tries, so it is the one that must
 * work. A second listener on `::1` is attempted for hosts where `localhost`
 * resolves IPv6-first; failure there is ignored, because IPv4 alone is a
 * working dashboard and a machine with no IPv6 loopback is not an error.
 *
 * Both are loopback: the dashboard is never reachable from the network.
 */
export function startLiteDashboard(port: number, hostname: string = LOOPBACK): Promise<Server> {
  const server = createLiteDashboardServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      if (hostname !== LOOPBACK) return resolve(server);
      // Best-effort dual-stack. Its lifetime is tied to the primary server so
      // `close()` on the returned handle tears down both.
      const v6 = createLiteDashboardServer();
      v6.once("error", () => resolve(server)); // no IPv6 loopback: IPv4 is enough
      v6.listen(port, "::1", () => {
        server.once("close", () => v6.close());
        resolve(server);
      });
    });
  });
}
