/**
 * The Node version check that runs before anything else at startup.
 *
 * The plugin starts this server with the `node` on the user's PATH, and most
 * job seekers have whatever Node an old tutorial installed, or none. Below the
 * tested version, what they got was whatever an older runtime does with this
 * code: a stack trace in a log they never open, and tools that silently don't
 * appear. One line naming the version found and the fix is the difference
 * between "it's broken" and "install Node 22, restart Claude".
 *
 * Dependency-free on purpose: it is imported before the MCP SDK, so the line is
 * written even when an import further down would be the thing that fails.
 */
export const MIN_NODE_MAJOR = 22;

/**
 * The stderr line for this Node version, or null when it is new enough.
 * `version` is `process.versions.node` ("20.11.1"); an unparseable value is
 * left alone rather than warned about, since the check must never be the
 * reason a working server complains.
 */
export function nodeVersionWarning(version: string): string | null {
  const major = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "", 10);
  if (!Number.isFinite(major) || major >= MIN_NODE_MAJOR) return null;
  return (
    `Career Compass needs Node.js ${MIN_NODE_MAJOR} or newer, but found Node ${version.replace(/^v/, "")}. ` +
    `Install Node ${MIN_NODE_MAJOR}+ from https://nodejs.org, then restart Claude.`
  );
}
