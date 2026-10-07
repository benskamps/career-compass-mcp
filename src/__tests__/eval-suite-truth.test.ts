import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Eval-suite guard: the committed eval suites are what eval-src/ generates, and
 * their MCP mocks are what the server in this commit actually returns.
 *
 * `claude plugin eval` answers every Career Compass tool from a recorded mock, so a
 * mock that is older than the server grades the plugin against a server nobody
 * runs. Both the suites and the mocks are generated, so the cheapest truth is to
 * generate them again and compare. Run `npm run eval:mocks && npm run eval:build`
 * when this goes red.
 *
 * Needs build/ (npm run build:mcp), as CI already does before the tests.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const evalSrc = path.join(repoRoot, "eval-src");
const AXES = ["activation", "first-reply", "task", "honesty", "surface", "memory", "trust", "retention", "voice"];

function tree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "results") continue;
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.set(path.relative(dir, full), readFileSync(full, "utf-8"));
    }
  };
  walk(dir);
  return out;
}

function expectSameTree(actual: string, expected: string) {
  const a = tree(actual);
  const e = tree(expected);
  expect([...a.keys()].sort()).toEqual([...e.keys()].sort());
  for (const [file, content] of e) expect(a.get(file), file).toBe(content);
}

describe("eval suite truth", () => {
  let scratch: string;

  beforeAll(() => {
    scratch = mkdtempSync(path.join(tmpdir(), "cc-eval-truth-"));
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it.skipIf(!existsSync(path.join(repoRoot, "build", "src", "index.js")))(
    "recorded mocks match the server in this commit",
    () => {
      const out = path.join(scratch, "mocks");
      execFileSync(process.execPath, [path.join(evalSrc, "record-mocks.mjs")], {
        env: { ...process.env, EVAL_MOCKS_ROOT: out },
        stdio: "pipe",
      });
      expectSameTree(out, path.join(evalSrc, "mocks"));
    },
    60_000,
  );

  it("the committed suites are what eval-src generates", () => {
    const out = path.join(scratch, "plugin");
    execFileSync(process.execPath, [path.join(evalSrc, "build-suite.mjs")], {
      env: { ...process.env, EVAL_SUITE_ROOT: out },
      stdio: "pipe",
    });
    expectSameTree(path.join(out, "evals"), path.join(repoRoot, "plugin", "evals"));
    expectSameTree(path.join(out, "evals-chat"), path.join(repoRoot, "plugin", "evals-chat"));
  });

  it("every grader is named for an axis the scoreboard knows", () => {
    for (const suite of ["evals", "evals-chat"]) {
      for (const [file] of tree(path.join(repoRoot, "plugin", suite))) {
        if (!file.includes(`graders${path.sep}`)) continue;
        const axis = path.basename(file, ".md").split("--")[0];
        expect(AXES, file).toContain(axis);
      }
    }
  });
});
