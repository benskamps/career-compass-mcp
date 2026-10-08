import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { savePipelineUnlocked } from "../file-store.js";

/**
 * Guard: career data is owner-only on disk.
 *
 * Salaries, offers and recruiter contacts were written with the default
 * 0644/0755, so any other account on a shared machine could read them, and
 * every `.bak` copy too. POSIX only: Windows has no mode bits to check.
 */

let dataDir: string;
let originalDataPath: string | undefined;

beforeEach(async () => {
  originalDataPath = process.env.CAREER_DATA_PATH;
  dataDir = await mkdtemp(join(tmpdir(), "cc-modes-"));
  process.env.CAREER_DATA_PATH = dataDir;
});

afterEach(async () => {
  if (originalDataPath === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = originalDataPath;
  await rm(dataDir, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("private file modes", () => {
  it("writes the pipeline, its directory and its backups owner-only", async () => {
    await savePipelineUnlocked({ applications: [], lastUpdated: "2026-06-20T00:00:00.000Z" });
    await savePipelineUnlocked({ applications: [], lastUpdated: "2026-06-21T00:00:00.000Z" });

    const dir = join(dataDir, "pipeline");
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, "applications.yaml"))).mode & 0o777).toBe(0o600);

    const baks = (await readdir(dir)).filter((n) => n.endsWith(".bak"));
    expect(baks.length).toBeGreaterThan(0);
    for (const b of baks) expect((await stat(join(dir, b))).mode & 0o777).toBe(0o600);
  });
});
