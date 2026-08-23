import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKUP_RETENTION, savePipelineUnlocked, saveCareerSection } from "../file-store.js";

/**
 * Guard: timestamped `.bak` files are capped, not accumulated forever.
 *
 * Every write copies the previous file aside first, which is the right call —
 * it is the only reason a corrupt or mistaken write is recoverable. Nothing
 * ever removed them, so the backups grew with every single write: one ordinary
 * search session left 224 files and 23.7 MB of them in ~/.career-compass, and
 * the number only went up from there. Each file keeps its most recent
 * BACKUP_RETENTION backups; older ones are pruned on the next write.
 */

let dataDir: string;
let originalDataPath: string | undefined;

/** A backup name in the exact format atomicWriteYaml produces. */
function bakName(base: string, isoish: string): string {
  return `${base}.${isoish}.bak`;
}

async function baksFor(dir: string, base: string): Promise<string[]> {
  const all = await readdir(dir);
  return all.filter((n) => n.startsWith(`${base}.`) && n.endsWith(".bak")).sort();
}

beforeEach(async () => {
  originalDataPath = process.env.CAREER_DATA_PATH;
  dataDir = await mkdtemp(join(tmpdir(), "cc-bak-"));
  process.env.CAREER_DATA_PATH = dataDir;
});

afterEach(async () => {
  if (originalDataPath === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = originalDataPath;
  await rm(dataDir, { recursive: true, force: true });
});

describe("backup pruning", () => {
  it("caps backups at BACKUP_RETENTION and keeps the newest", async () => {
    const dir = join(dataDir, "pipeline");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "applications.yaml"), "applications: []\nlastUpdated: x\n");

    // 12 pre-existing backups, oldest first.
    const stamps = Array.from({ length: 12 }, (_, i) =>
      `2026-06-${String(i + 1).padStart(2, "0")}T00-00-00-000Z`,
    );
    for (const s of stamps) {
      await writeFile(join(dir, bakName("applications.yaml", s)), "old\n");
    }

    await savePipelineUnlocked({ applications: [], lastUpdated: "2026-06-20T00:00:00.000Z" });

    const left = await baksFor(dir, "applications.yaml");
    expect(left).toHaveLength(BACKUP_RETENTION);
    // The oldest are the ones that went.
    expect(left.some((n) => n.includes("2026-06-01"))).toBe(false);
    // The newest pre-existing one survives, alongside the backup this write
    // just made (a real timestamp, which sorts after all the fixtures).
    expect(left.some((n) => n.includes("2026-06-12"))).toBe(true);
  });

  it("holds the cap across many consecutive writes", async () => {
    // The failure mode was unbounded growth over a session, not one bad write.
    for (let i = 0; i < 12; i++) {
      await saveCareerSection("skills", [
        { name: `skill-${i}`, category: "Technical" },
      ]);
    }
    const dir = join(dataDir, "career");
    expect((await baksFor(dir, "skills.yaml")).length).toBeLessThanOrEqual(BACKUP_RETENTION);
  });

  it("prunes only this file's backups", async () => {
    const dir = join(dataDir, "pipeline");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "applications.yaml"), "applications: []\nlastUpdated: x\n");
    for (let i = 1; i <= 8; i++) {
      const s = `2026-06-0${i}T00-00-00-000Z`;
      await writeFile(join(dir, bakName("applications.yaml", s)), "old\n");
      await writeFile(join(dir, bakName("neighbour.yaml", s)), "old\n");
    }

    await savePipelineUnlocked({ applications: [], lastUpdated: "2026-06-20T00:00:00.000Z" });

    expect(await baksFor(dir, "applications.yaml")).toHaveLength(BACKUP_RETENTION);
    expect(await baksFor(dir, "neighbour.yaml")).toHaveLength(8);
  });

  it("leaves hand-named backups alone", async () => {
    // A user who copied applications.yaml aside before an edit did not ask us
    // to garbage-collect it. Only the timestamped files this code writes are
    // ours to delete.
    const dir = join(dataDir, "pipeline");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "applications.yaml"), "applications: []\nlastUpdated: x\n");
    await writeFile(join(dir, "applications.yaml.before-my-edit.bak"), "mine\n");
    for (let i = 1; i <= 8; i++) {
      await writeFile(
        join(dir, bakName("applications.yaml", `2026-06-0${i}T00-00-00-000Z`)),
        "old\n",
      );
    }

    await savePipelineUnlocked({ applications: [], lastUpdated: "2026-06-20T00:00:00.000Z" });

    const left = await baksFor(dir, "applications.yaml");
    expect(left).toContain("applications.yaml.before-my-edit.bak");
    // …and it does not count against the cap of machine-written backups.
    expect(left.filter((n) => /\d{4}-\d{2}-\d{2}T/.test(n))).toHaveLength(BACKUP_RETENTION);
  });
});
