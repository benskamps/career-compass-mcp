import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { mutatePipeline, loadPipeline } from "../file-store.js";
import { handleUpdate } from "../../tools/pipeline.js";
import type { PipelineUpdateArgs } from "../../types/tool-args.js";
import type { Application } from "../../schemas/career-schema.js";

/**
 * Integration coverage for the P3 `dateUpdated` fix (src/tools/pipeline.ts
 * handleUpdate). handleUpdate used to stamp `dateUpdated` on EVERY call, which
 * always tripped mutatePipeline's no-op dirty check (the timestamp moved even
 * when nothing else did), so the skip could never fire — every update spent a
 * `.bak` and a fresh clock to record that nothing changed.
 *
 * This lives at the storage layer on purpose: the fix exists precisely so that
 * mutatePipeline's no-op skip becomes reachable, and that reachability is what
 * these tests pin. The NC is the no-op case — revert the conditional stamp and
 * it goes red.
 */

const ORIGINAL_PATH = process.env.CAREER_DATA_PATH;
let dataDir: string;

function seedApp(id: string): Application {
  return {
    id,
    company: id.toUpperCase(),
    role: "Engineer",
    status: "applied",
    dateUpdated: "2026-08-01T00:00:00.000Z",
    remote: "unknown",
    contacts: [],
    interviewRounds: [],
    notes: [],
    coverLetterGenerated: false,
    priority: "medium",
  };
}

async function countPipelineBaks(): Promise<number> {
  const files = await readdir(join(dataDir, "pipeline")).catch(() => [] as string[]);
  return files.filter((f) => /applications\.yaml\..*\.bak$/.test(f)).length;
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "cc-noop-"));
  process.env.CAREER_DATA_PATH = dataDir;
});

afterEach(async () => {
  if (ORIGINAL_PATH === undefined) delete process.env.CAREER_DATA_PATH;
  else process.env.CAREER_DATA_PATH = ORIGINAL_PATH;
  await rm(dataDir, { recursive: true, force: true });
});

describe("handleUpdate no-op skip (P3 dateUpdated)", () => {
  // ── THE NEGATIVE CONTROL ──────────────────────────────────────────────────
  it("a no-op update does NOT bump dateUpdated, so mutatePipeline skips the write", async () => {
    await mutatePipeline((p) => {
      p.applications.push(seedApp("a"));
    });
    const before = (await loadPipeline()).applications[0].dateUpdated;
    const baksBefore = await countPipelineBaks();

    // An update that changes nothing: the id resolves, but no field is supplied.
    await mutatePipeline((p) =>
      handleUpdate({ action: "update", id: "a" } as PipelineUpdateArgs, p),
    );

    const after = (await loadPipeline()).applications[0];
    expect(after.dateUpdated, "a no-op update stamped dateUpdated").toBe(before);
    // Write skipped ⇒ no fresh backup spent recording that nothing happened.
    expect(await countPipelineBaks(), "a no-op update still wrote (and backed up)").toBe(baksBefore);
  });

  // ── positive control: a real change still stamps and writes ───────────────
  it("a real field change DOES bump dateUpdated and persists", async () => {
    await mutatePipeline((p) => {
      p.applications.push(seedApp("b"));
    });
    const before = (await loadPipeline()).applications[0].dateUpdated;

    await mutatePipeline((p) =>
      handleUpdate({ action: "update", id: "b", priority: "high" } as PipelineUpdateArgs, p),
    );

    const after = (await loadPipeline()).applications[0];
    expect(after.priority).toBe("high");
    expect(after.dateUpdated).not.toBe(before);
  });
});
