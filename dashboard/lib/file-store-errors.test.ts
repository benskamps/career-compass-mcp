import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadCareerData,
  loadPipeline,
  CorruptDataError,
} from "@shared/storage/file-store";
import fs from "fs";
import os from "os";
import path from "path";

describe("file-store error handling", () => {
  let tmpDir: string;
  const origEnv = process.env.CAREER_DATA_PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-test-"));
    process.env.CAREER_DATA_PATH = tmpDir;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.CAREER_DATA_PATH = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ── loadCareerData ─────────────────────────────────────────────────────────

  it("loadCareerData returns null when career dir doesn't exist", async () => {
    // tmpDir exists but tmpDir/career does not
    const result = await loadCareerData();
    expect(result).toBeNull();
  });

  it("loadCareerData returns null when profile.yaml doesn't exist", async () => {
    fs.mkdirSync(path.join(tmpDir, "career"), { recursive: true });
    const result = await loadCareerData();
    expect(result).toBeNull();
  });

  it("loadCareerData throws CorruptDataError for malformed profile YAML (fail closed)", async () => {
    const careerDir = path.join(tmpDir, "career");
    fs.mkdirSync(careerDir, { recursive: true });
    fs.writeFileSync(path.join(careerDir, "profile.yaml"), "{{{invalid yaml");
    await expect(loadCareerData()).rejects.toBeInstanceOf(CorruptDataError);
  });

  it("loadCareerData handles malformed non-profile section gracefully", async () => {
    const careerDir = path.join(tmpDir, "career");
    fs.mkdirSync(careerDir, { recursive: true });

    const validProfile = [
      "name: Test",
      "summary: Test",
      "targetRoles: []",
      "targetIndustries: []",
      "targetCompanySize: []",
      "salaryCurrency: USD",
      "openToRemote: true",
      "openToRelocation: false",
    ].join("\n");

    fs.writeFileSync(path.join(careerDir, "profile.yaml"), validProfile);
    fs.writeFileSync(path.join(careerDir, "skills.yaml"), "{{{broken");

    const result = await loadCareerData();
    expect(result).not.toBeNull();
    expect(result!.skills).toEqual([]);
  });

  it("loadCareerData throws CorruptDataError for schema validation failure (fail closed)", async () => {
    const careerDir = path.join(tmpDir, "career");
    fs.mkdirSync(careerDir, { recursive: true });

    // Valid YAML but wrong schema — missing required fields like name, summary
    fs.writeFileSync(
      path.join(careerDir, "profile.yaml"),
      "foo: bar\nbaz: 123",
    );

    await expect(loadCareerData()).rejects.toBeInstanceOf(CorruptDataError);
  });

  // ── loadPipeline ───────────────────────────────────────────────────────────

  it("loadPipeline returns empty pipeline when file doesn't exist", async () => {
    // No pipeline/applications.yaml exists
    const result = await loadPipeline();
    expect(result.applications).toEqual([]);
    expect(result.lastUpdated).toBeDefined();
  });

  it("loadPipeline throws CorruptDataError for malformed YAML (fail closed)", async () => {
    const pipelineDir = path.join(tmpDir, "pipeline");
    fs.mkdirSync(pipelineDir, { recursive: true });
    fs.writeFileSync(
      path.join(pipelineDir, "applications.yaml"),
      "{{{broken yaml",
    );

    await expect(loadPipeline()).rejects.toBeInstanceOf(CorruptDataError);
  });
});
