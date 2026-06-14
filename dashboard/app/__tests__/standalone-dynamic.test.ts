import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import { createServer } from "net";
import fs from "fs";
import path from "path";

/**
 * P0 regression test: the packaged standalone dashboard must read
 * CAREER_DATA_PATH at *request* time, not bake it in at `next build` time.
 *
 * Before the fix, the data routes were statically prerendered (○) and the
 * standalone server served frozen build-time HTML — the empty state — even
 * when valid YAML existed at runtime. After forcing dynamic rendering, the
 * server must reflect the data pointed at by CAREER_DATA_PATH.
 *
 * This test runs the *already-built* standalone server (built by
 * `npm run build`) against `data/example` and asserts that the example data
 * ("Veridian Health") appears at /pipeline instead of the empty state.
 */

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const standaloneServer = path.join(
  repoRoot,
  "dashboard",
  ".next",
  "standalone",
  "dashboard",
  "server.js",
);
const exampleDataPath = path.join(repoRoot, "data", "example");

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      // Any HTTP response (including redirects) means the server is up.
      if (res.status > 0) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`);
}

const standaloneBuilt = fs.existsSync(standaloneServer);

describe.skipIf(!standaloneBuilt)(
  "standalone dashboard reads CAREER_DATA_PATH at runtime (P0)",
  () => {
    let child: ChildProcess;
    let baseUrl: string;

    beforeAll(async () => {
      const port = await getFreePort();
      baseUrl = `http://localhost:${port}`;
      child = spawn("node", [standaloneServer], {
        env: {
          ...process.env,
          PORT: String(port),
          HOSTNAME: "localhost",
          CAREER_DATA_PATH: exampleDataPath,
        },
        stdio: "ignore",
      });
      await waitForServer(baseUrl + "/pipeline", 30_000);
    }, 40_000);

    afterAll(() => {
      child?.kill("SIGTERM");
    });

    it("serves example pipeline data, not the empty state", async () => {
      const res = await fetch(baseUrl + "/pipeline", { redirect: "follow" });
      expect(res.ok).toBe(true);
      const html = await res.text();
      // Example data must be rendered at request time.
      expect(html).toContain("Veridian Health");
      // The empty-state call-to-action must NOT be present when data exists.
      expect(html).not.toContain("to add your first application");
    });

    it("does not ship prebuilt data HTML in the standalone bundle", () => {
      const serverAppDir = path.join(
        repoRoot,
        "dashboard",
        ".next",
        "server",
        "app",
      );
      const htmlFiles = fs.existsSync(serverAppDir)
        ? fs.readdirSync(serverAppDir).filter((f) => f.endsWith(".html"))
        : [];
      // Only framework error pages may be prerendered; data routes must not be.
      const dataRouteHtml = htmlFiles.filter((f) =>
        ["pipeline", "analytics", "career", "onboarding", "index"].some((r) =>
          f.startsWith(r),
        ),
      );
      expect(dataRouteHtml).toEqual([]);
    });
  },
);
