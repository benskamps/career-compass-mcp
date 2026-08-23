import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  loadPipeline,
  savePipelineUnlocked,
  saveCareerSection,
  CorruptDataError,
} from "../file-store.js";

/**
 * Real-filesystem integration tests for the P1 fail-closed write path.
 * These exercise actual read/copy/rename behavior rather than mocks, so they
 * catch regressions in atomicity and backup creation.
 */
describe("file-store fail-closed writes (real fs, P1)", () => {
  let tmpDir: string;
  const origEnv = process.env.CAREER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-failclosed-"));
    process.env.CAREER_DATA_PATH = tmpDir;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.CAREER_DATA_PATH = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("invalid pipeline YAML cannot be overwritten: load throws, save never runs", async () => {
    const pipelineDir = path.join(tmpDir, "pipeline");
    fs.mkdirSync(pipelineDir, { recursive: true });
    const file = path.join(pipelineDir, "applications.yaml");
    const corrupt = "{{{ not valid yaml at all";
    fs.writeFileSync(file, corrupt);

    // The realistic mutation flow is: load → mutate → save. The load must fail
    // closed so the destructive save is never reached.
    await expect(
      (async () => {
        const pipeline = await loadPipeline(); // throws here
        pipeline.applications.push({} as never);
        await savePipelineUnlocked(pipeline);
      })(),
    ).rejects.toBeInstanceOf(CorruptDataError);

    // The original corrupt file must be byte-for-byte intact (not overwritten
    // with an empty pipeline).
    expect(fs.readFileSync(file, "utf-8")).toBe(corrupt);
  });

  it("creates a .bak backup before a successful overwrite", async () => {
    const pipelineDir = path.join(tmpDir, "pipeline");
    fs.mkdirSync(pipelineDir, { recursive: true });
    const file = path.join(pipelineDir, "applications.yaml");

    // First save: file does not exist yet → no backup expected.
    await savePipelineUnlocked({ applications: [], lastUpdated: "x" });
    let baks = fs.readdirSync(pipelineDir).filter((f) => f.endsWith(".bak"));
    expect(baks).toHaveLength(0);
    expect(fs.existsSync(file)).toBe(true);

    // Second save: file exists → a timestamped .bak must be created first.
    await savePipelineUnlocked({ applications: [], lastUpdated: "y" });
    baks = fs.readdirSync(pipelineDir).filter((f) => f.endsWith(".bak"));
    expect(baks.length).toBeGreaterThanOrEqual(1);
    expect(baks[0]).toContain("applications.yaml");
  });

  it("does not leave temp files behind after an atomic write", async () => {
    const careerDir = path.join(tmpDir, "career");
    await saveCareerSection("skills", [{ name: "TypeScript", category: "Technical" }]);
    const leftovers = fs.readdirSync(careerDir).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toHaveLength(0);
    // And the destination file exists with the written content.
    expect(fs.existsSync(path.join(careerDir, "skills.yaml"))).toBe(true);
  });

  it("a missing pipeline file is the normal empty state (does not throw)", async () => {
    const result = await loadPipeline();
    expect(result.applications).toEqual([]);
    expect(result.lastUpdated).toBeDefined();
  });
});
