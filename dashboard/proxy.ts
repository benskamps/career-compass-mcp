import { NextResponse, type NextRequest } from "next/server";
import { isAllowedHost, refusalBody } from "@shared/loopback-guard";

/**
 * The loopback guard, for the Next dashboard.
 *
 * This file is the fix for the audit's two P0s. Until it existed, the dashboard
 * that `bin/cli.ts` *prefers* whenever it has been built — the one that renders
 * the entire Career KB including salary floor, salary ceiling and every
 * recruiter contact, and the one holding the only write path outside the MCP
 * server — had no host check, no middleware, and answered any `Host` at all.
 * Its read-only sibling, `dashboard-lite`, carried sixty lines arguing for
 * exactly this defense and implemented it. The hardening was on the surface that
 * needed it least.
 *
 * The proxy (Next 16's replacement for `middleware.ts` — same position in the
 * request path, new name) is the right seat for this rather than a per-route
 * check: it runs before routing, so a refused origin never learns which paths
 * exist, and it runs before Server Actions, so the write path is covered by the
 * same gate as the read path. There is no route in this app that should answer
 * a stranger.
 *
 * Do NOT substitute Next's built-in Server-Action origin check for this. That
 * compares `Origin` against `Host`; under DNS rebinding both are the attacker's
 * hostname, so they match and it does not intervene. An origin comparison
 * cannot help when the attacker controls the origin — only an allowlist of
 * loopback *names* can. See `src/loopback-guard.ts`.
 */
export default function proxy(request: NextRequest) {
  // `request.headers.get("host")` is the header as sent. Deliberately not
  // `request.nextUrl.host`, which Next may normalise or backfill from config —
  // the whole point is to inspect what the client actually claimed.
  const host = request.headers.get("host");
  if (isAllowedHost(host)) return NextResponse.next();

  return new NextResponse(refusalBody(host), {
    status: 403,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // A refusal must never be cached and re-served to a legitimate request.
      "cache-control": "no-store",
    },
  });
}

/**
 * Every path, including static assets and Server Action POSTs.
 *
 * The usual Next matcher excludes `_next/static`, `_next/image` and `favicon`
 * for performance. Not here: those exclusions are the shape of a hole. A page
 * whose HTML is refused but whose chunks are served still tells a stranger what
 * this app is, and carving out prefixes invites the next carve-out. Loopback
 * requests pay one set-membership check per asset, which is free.
 */
export const config = {
  matcher: "/:path*",
};
