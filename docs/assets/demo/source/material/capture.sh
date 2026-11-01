#!/usr/bin/env bash
# Re-captures the reply shown in the demo, on the claude.ai chat path: the plugin's skills
# and no MCP tools, the same setup as the plugin/evals-chat suite. From the repo root:
#   bash docs/assets/demo/source/material/capture.sh
# Needs the Claude Code CLI signed in. Writes reply.md (Claude's whole reply) and
# tools.txt (every tool call in the run, which should be one Skill call) beside this file.
# Use the first run. Re-running until a reply looks better would make the demo a pick.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../../../.." && pwd)"
# The résumé is the skill's own sample profile, so the demo and "show me a sample first" agree.
out="$(mktemp)"
claude -p "$(cat "$here/prompt.md")" \
  --plugin-dir "$repo/plugin" --strict-mcp-config --setting-sources "" \
  --tools Skill --allowedTools Skill \
  --output-format stream-json --verbose < /dev/null > "$out"
node -e '
const fs = require("fs");
const lines = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map(JSON.parse);
const tools = [];
let reply = "";
for (const d of lines) {
  if (d.type === "assistant") for (const c of d.message.content) if (c.type === "tool_use") tools.push(`${c.name} ${JSON.stringify(c.input)}`);
  if (d.type === "result") reply = d.result;
}
fs.writeFileSync(process.argv[2] + "/reply.md", reply.trim() + "\n");
fs.writeFileSync(process.argv[2] + "/tools.txt", tools.join("\n") + "\n");
console.log(tools.join("\n"));
' "$out" "$here"
rm -f "$out"
