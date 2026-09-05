// A stand-in for `claude -p … --output-format stream-json`, for the Ask-bridge
// tests. Echoes the prompt back as an assistant turn, pretends to call one
// career-compass tool, then emits a result — the exact three event shapes the
// real CLI produces (captured 2026-09-05 from Claude Code 2.1.261).
//
// FAKE_CLAUDE_MODE=error   → result with is_error and exit 1
// FAKE_CLAUDE_MODE=hang    → never exits (for the timeout / disconnect tests)
// FAKE_CLAUDE_MODE=silent  → exits 0 with no result line
const args = process.argv.slice(2);
const p = args.indexOf("-p");
const prompt = p >= 0 ? args[p + 1] : "(no prompt)";
const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");

if (mode === "hang") { setInterval(() => {}, 1000); }
else if (mode === "silent") { process.exit(0); }
else {
  emit({ type: "system", subtype: "init", args_seen: args });
  emit({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "mcp__career-compass__pipeline_view", input: { action: "stats" } }] } });
  emit({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: `You asked: ${prompt}\n\n- one bullet\n- **two** bullets` }] } });
  if (mode === "error") {
    emit({ type: "result", subtype: "error", is_error: true, result: "boom", total_cost_usd: 0.01 });
    process.exit(1);
  }
  emit({ type: "result", subtype: "success", is_error: false, result: "final", total_cost_usd: 0.0123 });
  process.exit(0);
}
