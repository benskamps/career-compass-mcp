import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Integration test for the CLI `--version` output (audit P3).
 *
 * Regression target: bin/cli.ts had `pkgVersion = pkgVersion` (a self-assign)
 * which always printed "vunknown". This test executes the *built* CLI rather
 * than re-implementing the parsing logic, so it actually catches that bug.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const builtCli = path.join(repoRoot, "build", "bin", "cli.js");
const expectedVersion = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf-8"),
).version as string;

const cliBuilt = existsSync(builtCli);

describe.skipIf(!cliBuilt)("CLI --version (P3)", () => {
  it("prints the real package version, not 'unknown'", () => {
    const out = execFileSync("node", [builtCli, "--version"], {
      encoding: "utf-8",
    }).trim();

    expect(out).toBe(`career-compass-mcp v${expectedVersion}`);
    expect(out).not.toContain("unknown");
  });

  it("supports the -v alias", () => {
    const out = execFileSync("node", [builtCli, "-v"], {
      encoding: "utf-8",
    }).trim();
    expect(out).toBe(`career-compass-mcp v${expectedVersion}`);
  });
});
