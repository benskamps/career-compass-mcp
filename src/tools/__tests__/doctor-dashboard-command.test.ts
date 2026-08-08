import { describe, it, expect } from "vitest";
import { homedir } from "os";
import { join } from "path";
import { dashboardCommand, DEFAULT_DASHBOARD_PORT, renderReport } from "../doctor.js";
import type { Finding } from "../doctor.js";

/**
 * `check_setup` tells you where your data is; its commands have to go there.
 *
 * The report prints the real data directory and then recommended a bare
 * `npx career-compass-mcp dashboard`. The dashboard reads CAREER_DATA_PATH and
 * has no --data flag, so for anyone whose folder is not the default that
 * command opened an empty board *and* created a fresh `~/.career-compass` — a
 * health check whose own advice manufactures the symptom.
 *
 * The second half is the shell. manifest.json declares win32 next to darwin and
 * linux, and `VAR=value command` is a syntax error in PowerShell, so a single
 * bash-shaped line is wrong for a third of the declared platforms.
 */

const DEFAULT_DIR = join(homedir(), ".career-compass");

describe("dashboardCommand", () => {
  it("carries a custom folder in both declared shells", () => {
    const custom = join("D:", "work", "career-data");
    const out = dashboardCommand(custom, DEFAULT_DASHBOARD_PORT);

    expect(out).toContain("PowerShell:");
    expect(out).toContain(`$env:CAREER_DATA_PATH="${custom}"`);
    expect(out).toContain("bash/zsh:");
    expect(out).toContain(`CAREER_DATA_PATH="${custom}" npx career-compass-mcp dashboard`);
    // The PowerShell line must not be the bash prefix form, which is what
    // shipped and what a Windows user would paste into an error.
    expect(out).not.toMatch(/PowerShell:\s+CAREER_DATA_PATH=/);
  });

  it("negative control: the default folder gets the plain command, no prefix", () => {
    // Otherwise every user, custom folder or not, is handed two lines of
    // environment plumbing to read past — and the guard above would pass on a
    // function that just always printed the prefix.
    const out = dashboardCommand(DEFAULT_DIR, DEFAULT_DASHBOARD_PORT);
    expect(out).toBe("npx career-compass-mcp dashboard");
    expect(out).not.toContain("CAREER_DATA_PATH");
  });

  it("keeps a non-default port on both lines", () => {
    const custom = join("D:", "work", "career-data");
    const out = dashboardCommand(custom, 4000);
    expect(out.split("\n")).toHaveLength(2);
    for (const line of out.split("\n")) expect(line).toContain("--port 4000");
  });

  it("omits the port flag when it is the default one", () => {
    expect(dashboardCommand(DEFAULT_DIR, DEFAULT_DASHBOARD_PORT)).not.toContain("--port");
    expect(dashboardCommand(DEFAULT_DIR, 4000)).toContain("--port 4000");
  });
});

describe("renderReport", () => {
  it("indents a multi-line fix under its arrow", () => {
    // A two-shell command is two lines. Left at column zero the second one
    // reads as a new finding rather than as part of the fix above it.
    const findings: Finding[] = [
      { label: "Dashboard", status: "ok", detail: "Not running.", fix: "line one\nline two" },
    ];
    const lines = renderReport(findings, false).split("\n");
    expect(lines).toContain("   → line one");
    expect(lines).toContain("     line two");
  });

  it("negative control: a single-line fix is untouched", () => {
    const findings: Finding[] = [
      { label: "Temp files", status: "ok", detail: "None.", fix: "nothing to do" },
    ];
    expect(renderReport(findings, false).split("\n")).toContain("   → nothing to do");
  });
});
