import { createServer, type Server } from "http";
import { getDataDir, loadPipeline, isCorruptDataError } from "../storage/file-store.js";
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
/**
 * Host names this server will answer to. Everything else is refused.
 *
 * Binding loopback stops the *network* from reaching the dashboard; it does not
 * stop a web page. Any site the user visits can point a hostname it controls at
 * 127.0.0.1 and have the browser issue same-origin requests to this server —
 * DNS rebinding. The one thing that distinguishes those requests from a real
 * one is the `Host` header, which carries the attacker's name rather than a
 * loopback name, so checking it is the whole defense.
 *
 * The dashboard serves a user's entire job search — companies, salaries,
 * contacts, interview notes — from a machine-local origin with no auth, which
 * is exactly the shape of target rebinding exists to reach.
 */
const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Split the hostname out of a `Host` header value, or reject the value.
 *
 * `Host` is `name[":" port]`, but a bracketed IPv6 literal (`[::1]:3141`) and a
 * bare one (`::1`, which some clients send) both contain colons, so a naive
 * split on ":" turns `[::1]` into `[`.
 *
 * Everything after the name is checked rather than discarded. Taking the left
 * half of the first colon and asking no questions about the right half let
 * `localhost:evil.com` and `[::1]evil.com` read as loopback. Nothing can put
 * those bytes on the wire from a browser — `Host` is built from the URL
 * authority, so a rebound page still sends its own name — but a parser that
 * answers a question it was not asked is one refactor away from mattering.
 * Only `:<digits>` is a port; anything else makes the header malformed, and
 * malformed is not loopback.
 */
function hostnameOf(host: string): string | null {
  const h = host.trim().toLowerCase();
  if (!h) return null;

  // Bracketed IPv6 literal: nothing may follow the closing bracket but a port.
  if (h.startsWith("[")) {
    const bracketed = /^(\[[0-9a-f:.]+\])(?::\d+)?$/.exec(h);
    return bracketed ? bracketed[1] : null;
  }

  // More than one colon and no brackets: a bare IPv6 literal, which cannot
  // carry a port — the whole value is the hostname, so every character of it
  // has to be one an address can contain.
  if (h.split(":").length - 1 > 1) {
    return /^[0-9a-f:.]+$/.test(h) ? h : null;
  }

  const named = /^([^:]+)(?::\d+)?$/.exec(h);
  return named ? named[1] : null;
}

/**
 * Is this `Host` header one of ours?
 *
 * A missing header is refused too. HTTP/1.1 requires it and every browser sends
 * it, so its absence is either a hand-written request or an attempt to skip the
 * check — neither is a case worth serving a career history to.
 */
export function isAllowedHost(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = hostnameOf(host);
  return hostname !== null && ALLOWED_HOSTNAMES.has(hostname);
}

export function createLiteDashboardServer(): Server {
  return createServer(async (req, res) => {
    // Checked before anything else, including the path: a rejected origin must
    // not learn which paths exist or how the server responds to them.
    if (!isAllowedHost(req.headers.host)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end(
        `Refused: this dashboard only answers to ${[...ALLOWED_HOSTNAMES].join(", ")}.\n` +
          `The request arrived with Host: ${req.headers.host ?? "(none)"}.\n\n` +
          `It binds loopback and is meant to be opened at http://localhost:<port> on this machine.`,
      );
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
      // Read per request, like the pipeline itself: the footer names the folder
      // this page is actually serving, not the default one.
      const html = renderLiteDashboard(pipeline, getDataDir());
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
export function startLiteDashboard(port: number, hostname = "127.0.0.1"): Promise<Server> {
  const server = createLiteDashboardServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      if (hostname !== "127.0.0.1") return resolve(server);
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
