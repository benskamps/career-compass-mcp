import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";

/**
 * What the dashboard command does with the folder it is pointed at.
 *
 * The README's own demo line was `CAREER_DATA_PATH=data/example npx -y
 * career-compass-mcp dashboard --lite`. `data/example` is relative and npx runs
 * from wherever the user is standing, so unless they were inside a clone it
 * named a folder that did not exist — and the CLI created it, opened an empty
 * dashboard, and said nothing. A stranger's first look at the product was a
 * blank board plus a stray directory in their home folder.
 *
 * `--sample` is what that command wanted: the demo inside the installed
 * package, found wherever npx unpacked it. And a CAREER_DATA_PATH that does not
 * exist is now refused rather than conjured.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const builtCli = path.join(repoRoot, "build", "bin", "cli.js");
const cliBuilt = existsSync(builtCli);

const temps: string[] = [];
afterEach(() => {
  for (const d of temps.splice(0)) {
    // Windows holds a lock on a process's working directory until it is fully
    // gone, and these tests run the CLI *in* the temp dir on purpose. Cleanup
    // is housekeeping; it must never be the thing that fails a test.
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Left in the OS temp directory, which is what it is for.
    }
  }
});

function tempDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), "cc-cli-"));
  temps.push(d);
  return d;
}

interface Run {
  code: number | null;
  stderr: string;
  /** Port the lite server reported, when it got that far. */
  port: number | null;
}

/**
 * Run the dashboard command to its first decision: either it refuses and exits,
 * or it starts listening — at which point we take the port and kill it.
 */
function runDashboard(args: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn("node", [builtCli, "dashboard", "--no-open", ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let settled = false;
    // Resolve only once the process is gone: on Windows its working directory
    // stays locked until then, and afterEach deletes that directory.
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const m = /http:\/\/localhost:(\d+)/.exec(stderr);
      resolve({ code, stderr, port: m ? Number(m[1]) : null });
    };
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString();
      if (/dashboard running at/i.test(stderr)) child.kill();
    });
    child.on("exit", (code) => finish(code));
    const timer = setTimeout(() => child.kill(), 20_000);
  });
}

describe.skipIf(!cliBuilt)("dashboard data path", () => {
  it("refuses a CAREER_DATA_PATH that does not exist, and creates nothing", async () => {
    const cwd = tempDir();
    const missing = path.join(cwd, "data", "example");

    const run = await runDashboard(["--lite"], { CAREER_DATA_PATH: "data/example" }, cwd);

    expect(run.code, `expected a refusal; stderr was:\n${run.stderr}`).toBe(1);
    expect(run.stderr).toContain("does not exist");
    // The absolute path, because "data/example" is exactly the string that is
    // not enough information to spot the mistake.
    expect(run.stderr).toContain(missing);
    expect(run.stderr).toContain("--sample");
    expect(
      existsSync(missing),
      "the CLI created the folder it was complaining about",
    ).toBe(false);
  }, 30_000);

  it("negative control: the same command runs once that folder exists", async () => {
    // Proves the refusal is about the folder being absent and not about
    // CAREER_DATA_PATH being set at all.
    const cwd = tempDir();
    mkdirSync(path.join(cwd, "data", "example"), { recursive: true });

    const run = await runDashboard(["--lite"], { CAREER_DATA_PATH: "data/example" }, cwd);

    expect(run.stderr).not.toContain("does not exist");
    expect(run.port, `refused a folder that exists:\n${run.stderr}`).not.toBeNull();
  }, 30_000);

  it("--sample serves the bundled demo and ignores CAREER_DATA_PATH entirely", async () => {
    const cwd = tempDir();
    const bogus = path.join(cwd, "nowhere");

    const run = await runDashboard(["--lite", "--sample"], { CAREER_DATA_PATH: bogus }, cwd);

    expect(run.stderr).toContain("read-only");
    expect(run.stderr).toContain(path.join("data", "example"));
    expect(run.port, `never started:\n${run.stderr}`).not.toBeNull();
    // Not refused and not created — the flag took the env var out of play.
    expect(existsSync(bogus)).toBe(false);
  }, 30_000);

  it("--demo is the same flag", async () => {
    const run = await runDashboard(["--lite", "--demo"], {}, tempDir());
    expect(run.stderr).toContain("read-only");
    expect(run.port).not.toBeNull();
  }, 30_000);

  it("serves actual sample data, not an empty board", async () => {
    // The failure this whole finding is about was an empty dashboard. Reading
    // the page is the only assertion that rules it out.
    const run = await runDashboardAndFetch(["--lite", "--sample"], tempDir());
    expect(run).toContain("Veridian Health");
    expect(run).not.toContain("Your pipeline is empty");
  }, 30_000);
});

/** Start with the given args, fetch the page once, then stop and wait for exit. */
function runDashboardAndFetch(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [builtCli, "dashboard", "--no-open", ...args], {
      cwd,
      env: { ...process.env, CAREER_DATA_PATH: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let fetched: string | Error | null = null;
    const timer = setTimeout(() => {
      fetched ??= new Error(`dashboard never started:\n${stderr}`);
      child.kill();
    }, 20_000);

    child.stderr.on("data", async (b: Buffer) => {
      stderr += b.toString();
      const m = /http:\/\/localhost:(\d+)/.exec(stderr);
      if (!m || fetched !== null) return;
      clearTimeout(timer);
      try {
        fetched = await (await fetch(`http://127.0.0.1:${m[1]}/`)).text();
      } catch (err) {
        fetched = err as Error;
      }
      child.kill();
    });

    // Settle on exit, so the child no longer holds `cwd` when cleanup runs.
    child.on("exit", () => {
      clearTimeout(timer);
      if (fetched instanceof Error) reject(fetched);
      else if (typeof fetched === "string") resolve(fetched);
      else reject(new Error(`dashboard exited before serving:\n${stderr}`));
    });
  });
}
