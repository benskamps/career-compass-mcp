import { createServer, type Server } from "http";
import { existsSync } from "fs";
import { join } from "path";
import { getDataDir, loadPipeline, isCorruptDataError } from "../storage/file-store.js";
import { renderLiteDashboard } from "./render.js";
import { ALLOWED_HOSTNAMES, LOOPBACK, isAllowedHost, refusalBody } from "../loopback-guard.js";
import { createAskBridge, type AskBridge, type ClaudeCommand } from "./ask-bridge.js";

export { ALLOWED_HOSTNAMES, isAllowedHost, hostnameOf } from "../loopback-guard.js";

export interface LiteServerOptions {
  /** When set, dashboard buttons ask Claude Code directly instead of copying a prompt. */
  ask?: { cmd: ClaudeCommand; timeoutMs?: number };
}

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
export function createLiteDashboardServer(options: LiteServerOptions = {}): Server {
  // One bridge per server, so the token in the page matches the token the
  // handler expects for the life of this process and no longer.
  let bridge: AskBridge | null = null;
  const getBridge = (): AskBridge | null => {
    if (!options.ask) return null;
    if (!bridge) bridge = createAskBridge({ dataDir: getDataDir(), cmd: options.ask.cmd, timeoutMs: options.ask.timeoutMs });
    return bridge;
  };
  return createServer(async (req, res) => {
    // Checked before anything else, including the path: a rejected origin must
    // not learn which paths exist or how the server responds to them.
    if (!isAllowedHost(req.headers.host)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end(refusalBody(req.headers.host));
      return;
    }
    const path = (req.url ?? "/").split("?")[0];
    // The Ask bridge, only when the operator switched it on.
    if (path === "/ask") {
      const b = getBridge();
      if (!b) { res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found"); return; }
      await b.handle(req, res);
      return;
    }
    // Only serve the dashboard at "/"; everything else 404s (favicon, etc.).
    if (path !== "/" && path !== "/index.html") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    try {
      const pipeline = await loadPipeline();
      const dataDir = getDataDir();
      const hasCareerKB = existsSync(join(dataDir, "career", "profile.yaml"));
      const b = getBridge();
      const html = renderLiteDashboard(pipeline, dataDir, new Date(), hasCareerKB, b ? { token: b.token } : undefined);
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
export function startLiteDashboard(port: number, hostname: string = LOOPBACK, options: LiteServerOptions = {}): Promise<Server> {
  const server = createLiteDashboardServer(options);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      if (hostname !== LOOPBACK) return resolve(server);
      // Best-effort dual-stack. Its lifetime is tied to the primary server so
      // `close()` on the returned handle tears down both.
      // Same options, so an ::1 visitor gets the same bridge (and a token that
      // its own page carries). Tokens differ per listener; each page matches its own.
      const v6 = createLiteDashboardServer(options);
      v6.once("error", () => resolve(server)); // no IPv6 loopback: IPv4 is enough
      v6.listen(port, "::1", () => {
        server.once("close", () => v6.close());
        resolve(server);
      });
    });
  });
}
