/**
 * The one line (or paragraph) the MCP server prints to stderr on start.
 *
 * When stdin is a pipe, an MCP client launched us and one terse line is right.
 * When stdin is a TTY, a person typed `career-compass-mcp` into a terminal —
 * usually straight from the README — and the old one-liner left them looking at
 * a cursor that never moved, with no way to know this process is meant to be
 * launched by Claude, or how to get out. Orient them and name the exit.
 *
 * Pure so the TTY branch can be tested without a TTY.
 */
export function stdioBanner(isTTY: boolean): string {
  if (!isTTY) return "Career Compass MCP server running on stdio";
  return [
    "Career Compass MCP server running on stdio — waiting for an MCP client.",
    "",
    "This command is what Claude Desktop / Claude Code launches for you; run by hand it just waits.",
    "  To see the product now:      career-compass-mcp dashboard --sample",
    "  To wire it into a client:    career-compass-mcp --help   (or the README's Install section)",
    "Press Ctrl+C to stop.",
  ].join("\n");
}
