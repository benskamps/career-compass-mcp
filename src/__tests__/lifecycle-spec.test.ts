import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { mutatePipeline, loadPipeline, saveCareerSection } from "../storage/file-store.js";
import { isWriteClaimUnavailable, CLAIM_TTL_MS } from "../storage/write-claim.js";
import { isAllowedHost } from "../loopback-guard.js";

/**
 * The lifecycle diagram, as an executable spec.
 *
 * `docs/architecture-audit.md` §8 and §11 draw two state machines: the one the
 * code had, and the one it should have. Those pictures were the most useful
 * artefact of the whole audit — a reachable state that should not exist is
 * easier to see than to argue about — and then they went into a document, where
 * a diagram's usual fate is to become a description of the past.
 *
 * So the ideal machine lives here too, in the only form that cannot drift: a
 * test per transition, and a test per state the diagram says is unreachable.
 * If someone reintroduces the bug, this fails and names the transition by the
 * label it has in the figure.
 *
 * §11, verbatim:
 *
 *   [*]        --> Requested
 *   Requested  --> Guarded      : every surface, no exception
 *   Guarded    --> Refused      : Host not loopback
 *   Guarded    --> Reading      : Host loopback
 *   Reading    --> Rendered
 *   Rendered   --> Claiming     : write requested
 *   Claiming   --> Writing      : claim acquired
 *   Claiming   --> Unavailable  : another process holds the dir
 *   Writing    --> Persisted    : atomic rename + .bak
 *   Unavailable--> Rendered     : told plainly, nothing written
 *
 * And the two states the CURRENT machine (§8) could reach that this one must
 * not: `Rendered` without passing `Guarded`, and `LostUpdate`.
 */

let dir: string;

function freshStore(): string {
  dir = mkdtempSync(join(tmpdir(), "cc-spec-"));
  mkdirSync(join(dir, "career"), { recursive: true });
  mkdirSync(join(dir, "pipeline"), { recursive: true });
  process.env.CAREER_DATA_PATH = dir;
  return dir;
}

function cleanup() {
  delete process.env.CAREER_DATA_PATH;
  if (dir) rmSync(dir, { recursive: true, force: true });
}

/** Plant a claim held by a live process that is not us. */
function foreignClaimHeld(): boolean {
  const pid = process.ppid;
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EPERM") return false;
  }
  writeFileSync(
    join(dir, ".write-claim"),
    JSON.stringify({ pid, nonce: "spec", acquiredAt: new Date().toISOString(), holder: "another process" }),
    "utf-8",
  );
  return true;
}

describe("lifecycle §11 — transitions the ideal machine must have", () => {
  it("Guarded --> Refused : Host not loopback", () => {
    expect(isAllowedHost("evil.example")).toBe(false);
    expect(isAllowedHost("localhost.evil.example")).toBe(false);
    expect(isAllowedHost(undefined)).toBe(false);
  });

  it("Guarded --> Reading : Host loopback", () => {
    for (const h of ["localhost", "127.0.0.1", "[::1]", "::1", "localhost:3141"]) {
      expect(isAllowedHost(h), h).toBe(true);
    }
  });

  it("Claiming --> Writing --> Persisted : atomic rename + .bak", async () => {
    freshStore();
    try {
      await saveCareerSection("skills", [{ name: "Rust", category: "Technical" }]);
      // Persisted: the write landed…
      const first = readFileSync(join(dir, "career", "skills.yaml"), "utf-8");
      expect(first).toContain("Rust");

      await saveCareerSection("skills", [{ name: "Go", category: "Technical" }]);
      // …and the previous version is recoverable, which is what makes the
      // transition safe rather than merely successful.
      const baks = readdirSync(join(dir, "career")).filter((n) => n.endsWith(".bak"));
      expect(baks.length, "no .bak was kept, so a bad write is unrecoverable").toBeGreaterThan(0);
      expect(readFileSync(join(dir, "career", baks[0]), "utf-8")).toContain("Rust");
    } finally {
      cleanup();
    }
  });

  it("Claiming --> Unavailable : another process holds the dir", async () => {
    freshStore();
    try {
      if (!foreignClaimHeld()) return; // no live foreign pid; nothing to assert
      let err: unknown;
      try {
        await saveCareerSection("skills", [{ name: "Ada", category: "Technical" }]);
      } catch (e) {
        err = e;
      }
      expect(isWriteClaimUnavailable(err), "a second writer was not refused").toBe(true);
      // "nothing written" is half the transition, and the half that matters.
      expect(readdirSync(join(dir, "career"))).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("Unavailable --> Rendered : told plainly, nothing written", () => {
    // The transition is only real if the refusal reaches a human. Every write
    // path must surface it rather than let it escape as a transport error —
    // this is the gap the diagram exposed after the guard was already built.
    const pipeline = readFileSync("src/tools/pipeline.ts", "utf-8");
    const kb = readFileSync("src/tools/career-kb.ts", "utf-8");
    expect(pipeline, "pipeline tools do not surface an unavailable store").toContain(
      "isWriteClaimUnavailable",
    );
    expect(kb, "career-kb tools do not surface an unavailable store").toContain(
      "isWriteClaimUnavailable",
    );
  });
});

describe("lifecycle §8 — states the ideal machine must NOT reach", () => {
  it("`Rendered` is unreachable without passing `Guarded`", () => {
    // Both serving surfaces apply the guard before anything else. Asserted
    // structurally because the live proof lives in loopback-guard.test.ts; what
    // this pins is that neither surface can be rebuilt without one.
    const lite = readFileSync("src/dashboard-lite/server.ts", "utf-8");
    expect(lite.indexOf("isAllowedHost")).toBeLessThan(lite.indexOf("req.url"));
    const proxy = readFileSync("dashboard/proxy.ts", "utf-8");
    expect(proxy).toContain("isAllowedHost");
    expect(proxy).toMatch(/matcher:\s*["'`]\/:path\*/);
  });

  it("`LostUpdate` is unreachable : concurrent writers cannot both succeed", async () => {
    freshStore();
    try {
      await saveCareerSection("skills", []);
      // Two read-modify-write cycles dispatched without awaiting the first —
      // exactly what an MCP client does when the user says "add both of these".
      const app = (id: string) => ({
        id,
        company: id.toUpperCase(),
        role: "Engineer",
        status: "applied" as const,
        dateUpdated: "2026-08-22",
        remote: "unknown" as const,
        contacts: [],
        interviewRounds: [],
        notes: [],
        coverLetterGenerated: false,
        priority: "medium" as const,
      });
      await Promise.all([
        mutatePipeline((p) => {
          p.applications.push(app("a") as never);
        }),
        mutatePipeline((p) => {
          p.applications.push(app("b") as never);
        }),
      ]);
      const after = await loadPipeline();
      // The defining symptom of a lost update: two successes, one survivor.
      expect(
        after.applications.map((a) => a.id).sort(),
        "one of two concurrent writes was silently lost",
      ).toEqual(["a", "b"]);
    } finally {
      cleanup();
    }
  });

  it("a stale claim cannot wedge the store forever", async () => {
    freshStore();
    try {
      writeFileSync(
        join(dir, ".write-claim"),
        JSON.stringify({
          pid: 0x7ffffffe,
          nonce: "dead",
          acquiredAt: new Date(Date.now() - CLAIM_TTL_MS - 5_000).toISOString(),
          holder: "a process that crashed",
        }),
        "utf-8",
      );
      // A claim outliving its holder is a worse failure than the race it
      // prevents, so the machine must be able to recover on its own.
      await saveCareerSection("skills", [{ name: "Recovered", category: "Technical" }]);
      expect(readFileSync(join(dir, "career", "skills.yaml"), "utf-8")).toContain("Recovered");
    } finally {
      cleanup();
    }
  });
});
