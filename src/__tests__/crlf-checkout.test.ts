import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

/**
 * A Windows checkout must build and test like a Linux one.
 *
 * With core.autocrlf on (the Git for Windows default), every text file arrived
 * CRLF. docs/privacy/build.mjs then spun forever on "## Heading\r" until V8 ran
 * out of array length, and three test files plus the eval builder missed their
 * front matter: six red tests on Windows, none on CI. CI runs on Linux, so these
 * feed the parsers CRLF directly instead of waiting for a Windows run.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");

type PrivacyBuild = {
  toHtml(md: string): string;
  render(markdown: string, iconHref: string): string;
};

async function privacyBuild(): Promise<PrivacyBuild> {
  return (await import(pathToFileURL(path.join(repoRoot, "docs/privacy/build.mjs")).href)) as PrivacyBuild;
}

describe("CRLF checkout", () => {
  it("the privacy page renders the same from a CRLF policy", async () => {
    const { render } = await privacyBuild();
    const md = readFileSync(path.join(repoRoot, "docs/privacy.md"), "utf-8").replace(/\r\n?/g, "\n");
    expect(render(crlf(md), "icon-32.png")).toBe(render(md, "icon-32.png"));
  });

  it("a heading line ending in \\r is still a heading, and the converter finishes", async () => {
    const { toHtml } = await privacyBuild();
    expect(toHtml("## What data\r\n\r\nSome text.\r\n")).toBe('<h2 id="what-data">What data</h2>\n<p>Some text.</p>');
  });

  it("a line no rule matches is consumed, not looped on", async () => {
    // "####" is neither an h2/h3 nor paragraph text. It used to stop the loop
    // from advancing; the same trap the CRLF heading fell into.
    const { toHtml } = await privacyBuild();
    expect(toHtml("#### Deep\n\nAfter.")).toBe("<p>#### Deep</p>\n<p>After.</p>");
  });

  it.skipIf(!existsSync(path.join(repoRoot, ".git")))(".gitattributes checks text files out as LF everywhere", () => {
    // The root cause, fixed at the source: core.autocrlf no longer rewrites them.
    const files = ["docs/privacy.md", "plugin/skills/career-compass/SKILL.md", "eval-src/personas", "src/index.ts"];
    const run = spawnSync("git", ["check-attr", "eol", "--", ...files], { cwd: repoRoot, encoding: "utf-8" });
    expect(run.status, run.stderr).toBe(0);
    for (const f of files) expect(run.stdout).toContain(`${f}: eol: lf`);
  });
});
