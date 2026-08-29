/**
 * The loopback guard — one module, every surface that can serve the Career KB.
 *
 * This logic used to live inside `dashboard-lite/server.ts`, which meant the
 * dashboard that ships to npm (read-only, pipeline only) was defended and the
 * Next dashboard — preferred by `bin/cli.ts` whenever it has been built, able
 * to render the entire Career KB including salary floor/ceiling and every
 * recruiter contact, and holder of the only write path outside the MCP server —
 * was not. The hardening was on the surface that needed it least. Extracting it
 * here is the fix, and keeping it here is what stops a third viewer from having
 * to re-argue it.
 *
 * ── The threat ──────────────────────────────────────────────────────────────
 *
 * Binding loopback stops the *network* from reaching the dashboard. It does not
 * stop a web page. Any site the user visits can point a hostname it controls at
 * 127.0.0.1 and have the browser issue same-origin requests to this server —
 * DNS rebinding. The one thing that distinguishes those requests from a real one
 * is the `Host` header, which carries the attacker's name rather than a loopback
 * name, so checking it is the whole defense.
 *
 * Do not reach for a framework's built-in cross-origin check instead. Next's
 * Server-Action guard compares `Origin` against `Host`; under rebinding both are
 * the attacker's hostname, they match, and it does not intervene. An origin
 * comparison cannot help when the attacker controls the origin. Only an
 * allowlist of loopback *names* can.
 */

/**
 * Host names this project will answer to. Everything else is refused.
 *
 * `0.0.0.0` is deliberately absent: it is a bind address, never a name a client
 * legitimately puts in a `Host` header, and some proxies accept it as a wildcard.
 */
export const ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);

/**
 * The address every surface binds. The literal, never the name.
 *
 * Passing "localhost" lets Node resolve it, and on Windows that returns `::1`
 * first — so the server binds IPv6-only, every client that tries `127.0.0.1`
 * gets ECONNREFUSED, and the CLI cheerfully prints a `http://localhost` URL that
 * happens to work on the author's machine. Which of the two a given browser
 * picks is not something we get to decide, so binding the name is a coin flip on
 * someone else's computer.
 */
export const LOOPBACK = "127.0.0.1";

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
export function hostnameOf(host: string): string | null {
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
export function isAllowedHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = hostnameOf(host);
  if (hostname === null) return false;
  // A single trailing dot is the DNS root label: `localhost.` and `127.0.0.1.`
  // are the fully-qualified forms of names we already answer to, and a browser
  // will happily resolve and connect to them. Strip exactly one trailing dot
  // before the allowlist compare so the FQDN form is not refused. This cannot
  // widen the allowlist — `localhost.evil.com` has no trailing dot to strip and
  // still fails, `localhost..` strips to `localhost.` which is not allowed, and
  // fail-closed is preserved because only names that land exactly on an entry
  // pass.
  const normalized = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  return ALLOWED_HOSTNAMES.has(normalized);
}

/**
 * The body served to a refused request.
 *
 * Deliberately identical on both dashboards, and deliberately says nothing about
 * what exists behind the guard: a rejected origin must not learn which paths are
 * there or how the server responds to them.
 */
export function refusalBody(host: string | null | undefined): string {
  return (
    `Refused: this dashboard only answers to ${[...ALLOWED_HOSTNAMES].join(", ")}.\n` +
    `The request arrived with Host: ${host ?? "(none)"}.\n\n` +
    `It binds loopback and is meant to be opened at http://localhost:<port> on this machine.`
  );
}
