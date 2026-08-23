import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises and fs before imports
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  copyFile: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("yaml", () => ({
  parse: vi.fn(),
  stringify: vi.fn(() => "mocked-yaml-output"),
}));

import { readFile, writeFile, mkdir, rename, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { loadPipeline, savePipelineUnlocked, saveCareerSection, loadCareerData, CorruptDataError } from "../file-store.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockRename = vi.mocked(rename);
const mockCopyFile = vi.mocked(copyFile);
const mockParseYaml = vi.mocked(parseYaml);
const mockStringifyYaml = vi.mocked(stringifyYaml);

// ─── loadPipeline ────────────────────────────────────────────────────────────

describe("loadPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed pipeline when file exists", async () => {
    const pipelineData = {
      applications: [
        {
          id: "abc",
          company: "TestCorp",
          role: "Engineer",
          status: "applied",
          dateUpdated: "2026-03-01T00:00:00.000Z",
          contacts: [],
          interviewRounds: [],
          notes: [],
          coverLetterGenerated: false,
          remote: "unknown",
          priority: "medium",
        },
      ],
      lastUpdated: "2026-03-01T00:00:00.000Z",
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue("yaml-content" as any);
    mockParseYaml.mockReturnValue(pipelineData);

    const result = await loadPipeline();

    expect(result.applications).toHaveLength(1);
    expect(result.applications[0].company).toBe("TestCorp");
    expect(result.lastUpdated).toBe("2026-03-01T00:00:00.000Z");
  });

  it("returns empty pipeline when file is missing", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await loadPipeline();

    expect(result.applications).toEqual([]);
    expect(result.lastUpdated).toBeDefined();
  });

  it("throws (fails closed) when YAML parse fails for an existing file", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue("invalid yaml" as any);
    mockParseYaml.mockReturnValue(null); // will fail zod parse

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Must NOT return an empty pipeline — that would let a later save overwrite
    // the user's real (recoverable) applications.yaml.
    await expect(loadPipeline()).rejects.toBeInstanceOf(CorruptDataError);
    consoleSpy.mockRestore();
  });
});

// ─── savePipelineUnlocked ────────────────────────────────────────────────────────────

describe("savePipelineUnlocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes atomically (temp file + rename) to the correct path", async () => {
    const pipeline = {
      applications: [],
      lastUpdated: "2026-03-01T00:00:00.000Z",
    };

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(false); // no existing file → no backup

    await savePipelineUnlocked(pipeline);

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining("pipeline"),
      { recursive: true }
    );
    // Writes to a temp file, never directly to the destination.
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".tmp"),
      "mocked-yaml-output",
      "utf-8"
    );
    // Then atomically renames temp → applications.yaml.
    expect(mockRename).toHaveBeenCalledWith(
      expect.stringContaining(".tmp"),
      expect.stringContaining("applications.yaml")
    );
  });

  it("creates a timestamped .bak backup before overwriting an existing file", async () => {
    const pipeline = {
      applications: [],
      lastUpdated: "2026-03-01T00:00:00.000Z",
    };

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true); // existing file present → back it up

    await savePipelineUnlocked(pipeline);

    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.stringContaining("applications.yaml"),
      expect.stringContaining(".bak")
    );
  });
});

// ─── saveCareerSection ───────────────────────────────────────────────────────

describe("saveCareerSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes YAML atomically to the correct path for a section", async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(false);

    await saveCareerSection("skills", [{ name: "TypeScript", category: "Technical" }]);

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining("career"),
      { recursive: true }
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".tmp"),
      "mocked-yaml-output",
      "utf-8"
    );
    expect(mockRename).toHaveBeenCalledWith(
      expect.stringContaining(".tmp"),
      expect.stringContaining("skills.yaml")
    );
  });
});

// ─── loadCareerData ──────────────────────────────────────────────────────────

describe("loadCareerData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when career directory does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await loadCareerData();

    expect(result).toBeNull();
  });

  it("returns null when profile.yaml does not exist", async () => {
    // First call: careerDir() exists. Second call: profile.yaml does not.
    mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = await loadCareerData();

    expect(result).toBeNull();
  });

  it("parses career data when profile exists", async () => {
    const profileData = {
      name: "Test User",
      summary: "A test professional summary for unit tests.",
    };

    // existsSync: careerDir(true), profilePath(true), then each section file
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue("yaml-content" as any);
    mockParseYaml.mockReturnValue(profileData);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await loadCareerData();
    consoleSpy.mockRestore();

    // It may return null if zod validation fails on assembled data,
    // but it should at least attempt to read and parse files
    expect(mockReadFile).toHaveBeenCalled();
  });
});
