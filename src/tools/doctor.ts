import { z } from "zod";
import { access, readdir, readFile } from "fs/promises";
import { constants as FS } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDataDir, loadPipeline, isCorruptDataError, CAREER_SECTIONS } from "../storage/file-store.js";
import { PKG_NAME, PKG_VERSION } from "../version.js";

/**
 * `check_setup` — the tool you run when Career Compass feels broken.
 *
 * The one real user this package has described her setup as "rough around the
 * edges" and assumed the roughness was her fault. It wasn't: she was on a stale
 * install, and the fix turned out to be "ask Claude to pull from git." Nothing
 * in the product could have told her that. Every other tool here answers a
 * career question; none of them answer "is this thing actually working?", so
 * the only diagnostic available was the user's own patience.
 *
 * So this reports the whole install in one pass — version, data directory,
 * Career KB contents, pipeline integrity, leftover temp files, dashboard — and
 * every finding that isn't already fine carries the single next command. The
 * output is deliberately one compact block: a health check that needs a
 * follow-up question has failed at its job.
 */

// ─── Finding model ────────────────────────────────────────────────────────────

/**
 * `unknown` is a first-class status, not a failure. The update check cannot
 * succeed offline, and rendering that as ❌ would teach users to ignore ❌.
 */
export type FindingStatus = "ok" | "warn" | "problem" | "unknown";

export interface Finding {
  label: string;
  status: FindingStatus;
  detail: string;
  /** The one command or sentence that resolves it. Omitted when nothing to do. */
  fix?: string;
}

const GLYPH: Record<FindingStatus, string> = {
  ok: "✅",
  warn: "⚠️",
  problem: "❌",
  unknown: "ℹ️",
};

// ─── Update check (the only outbound network call in this package) ────────────

export type UpdateCheckResult =
  | { ok: true; latest: string }
  | { ok: false; reason: string };

/** Injected so tests never touch the network. See {@link registerDoctorTools}. */
export type UpdateChecker = () => Promise<UpdateCheckResult>;

/** Where the update check asks. Exported so the privacy test can assert it. */
export const REGISTRY_URL = `https://registry.npmjs.org/${PKG_NAME}/latest`;

/**
 * Ask the public npm registry which version is current.
 *
 * This is the first and only outbound request Career Compass has ever made, in
 * a product whose entire pitch is that nothing leaves your machine — so the
 * shape of it matters more than the feature does:
 *
 * - It is an unauthenticated GET for a public package name. No headers that
 *   identify the user, no query string, no body, no cookies. The registry
 *   learns that someone asked about `career-compass-mcp`, which is the same
 *   thing `npm view` tells it.
 * - `/latest` rather than the full packument: one small JSON document instead
 *   of every version's metadata.
 * - It fails soft. A timeout, a DNS failure, an offline laptop, a corporate
 *   proxy returning HTML — all resolve to `{ ok: false }` with a human reason,
 *   never a thrown error. Being offline is not a problem with your install, and
 *   a health check that reports it as one is worse than no health check.
 * - It is skippable: `checkForUpdates: false` never constructs the request.
 *
 * Disclosed in PRIVACY.md under "Update checks".
 */
export async function checkNpmForUpdate(timeoutMs = 3000): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
      redirect: "follow",
    });
    if (!response.ok) {
      return { ok: false, reason: `the npm registry answered HTTP ${response.status}` };
    }
    const body = (await response.json()) as { version?: unknown };
    if (typeof body.version !== "string") {
      return { ok: false, reason: "the npm registry response had no version field" };
    }
    return { ok: true, latest: body.version };
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, reason: `no answer from the npm registry within ${timeoutMs}ms` };
    }
    return { ok: false, reason: "could not reach the npm registry (offline, or a proxy is in the way)" };
  }
}

// ─── Version comparison ───────────────────────────────────────────────────────

interface ParsedVersion {
  core: number[];
  prerelease: string[];
}

function parseVersion(raw: string): ParsedVersion | null {
  // Drop build metadata: semver says it takes no part in precedence.
  const withoutBuild = raw.trim().replace(/^v/, "").split("+")[0];
  const [corePart, ...preParts] = withoutBuild.split("-");
  const core = corePart.split(".").map((n) => Number(n));
  if (core.length !== 3 || core.some((n) => !Number.isInteger(n) || n < 0)) return null;
  const prerelease = preParts.join("-");
  return { core, prerelease: prerelease ? prerelease.split(".") : [] };
}

/**
 * Semver precedence, enough of it to answer "am I behind?" without a dependency.
 *
 * Returns a negative number when `a` precedes `b`, positive when it follows,
 * 0 when equal, and `null` when either side is unparseable — which is a real
 * case (`PKG_VERSION` is "unknown" if package.json can't be read) and must not
 * silently compare as "up to date".
 */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;

  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  }

  // 1.0.0-rc.1 precedes 1.0.0: a version WITH a prerelease is the earlier one.
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;

  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i++) {
    const l = left.prerelease[i];
    const r = right.prerelease[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNum = /^\d+$/.test(l);
    const rNum = /^\d+$/.test(r);
    if (lNum && rNum) {
      if (Number(l) !== Number(r)) return Number(l) - Number(r);
    } else if (lNum !== rNum) {
      return lNum ? -1 : 1; // numeric identifiers rank below alphanumeric ones
    } else if (l !== r) {
      return l < r ? -1 : 1;
    }
  }
  return 0;
}

function versionFinding(result: UpdateCheckResult | null): Finding {
  if (result === null) {
    return {
      label: "Version",
      status: "unknown",
      detail: `v${PKG_VERSION} installed. Update check skipped, as you asked.`,
      fix: "Run this again with checkForUpdates: true to compare against the npm registry.",
    };
  }
  if (!result.ok) {
    return {
      label: "Version",
      status: "unknown",
      detail: `v${PKG_VERSION} installed. Could not check for a newer one — ${result.reason}.`,
      fix: "Nothing to do; this is a network condition, not a problem with your install.",
    };
  }

  const order = compareVersions(PKG_VERSION, result.latest);
  if (order === null) {
    return {
      label: "Version",
      status: "unknown",
      detail: `This install reports its version as "${PKG_VERSION}", which isn't a version number, so it can't be compared against v${result.latest} on npm.`,
      fix: "Reinstall the package — a missing or unreadable package.json usually means a truncated download.",
    };
  }
  if (order < 0) {
    return {
      label: "Version",
      status: "warn",
      detail: `v${PKG_VERSION} installed; v${result.latest} is the current release on npm.`,
      fix: `Ask Claude: "update career-compass-mcp to ${result.latest}" — see the Upgrading section of the README for your install type (Claude Desktop bundle, npm, or source).`,
    };
  }
  if (order > 0) {
    return {
      label: "Version",
      status: "ok",
      detail: `v${PKG_VERSION} installed, ahead of v${result.latest} on npm — you're running from source or a prerelease.`,
    };
  }
  return {
    label: "Version",
    status: "ok",
    detail: `v${PKG_VERSION} is the current release.`,
  };
}

// ─── Data directory ───────────────────────────────────────────────────────────

async function dataDirFinding(dataDir: string): Promise<Finding> {
  try {
    await access(dataDir, FS.F_OK);
  } catch {
    return {
      label: "Data directory",
      status: "problem",
      detail: `${dataDir} does not exist.`,
      fix: "Restart your MCP client — the server creates this directory on startup. If it keeps failing, CAREER_DATA_PATH points somewhere you cannot create.",
    };
  }

  try {
    // A permission check, not a write: this tool declares readOnlyHint, and a
    // probe file that "cleans up after itself" would still be a write a host
    // was told wouldn't happen. On Windows this can read as writable when a
    // deeper ACL would refuse, so a passing check is a floor, not a guarantee.
    await access(dataDir, FS.W_OK);
  } catch {
    return {
      label: "Data directory",
      status: "problem",
      detail: `${dataDir} exists but is not writable, so nothing you save can be stored.`,
      fix: "Fix the folder's permissions, or point CAREER_DATA_PATH at a directory you own.",
    };
  }

  return {
    label: "Data directory",
    status: "ok",
    detail: `${dataDir} exists and is writable.`,
  };
}

// ─── Career KB ────────────────────────────────────────────────────────────────

interface SectionState {
  section: string;
  present: boolean;
  count: number;
  unreadable: boolean;
}

/**
 * Inspect each career section file directly rather than through
 * `loadCareerData()`.
 *
 * The loader merges everything and fails closed on a bad profile, which is the
 * right behavior for a tool doing real work and the wrong behavior for a
 * diagnostic: one unparseable file would take the whole report down and tell
 * the user nothing about the other five. Reading them one at a time is the
 * point — "which file is the broken one" is the answer they came for.
 */
async function readSectionStates(careerDir: string): Promise<SectionState[]> {
  const sections = [...CAREER_SECTIONS, "journal"];
  return Promise.all(
    sections.map(async (section) => {
      const path = join(careerDir, `${section}.yaml`);
      let raw: string;
      try {
        raw = await readFile(path, "utf-8");
      } catch {
        return { section, present: false, count: 0, unreadable: false };
      }
      try {
        const parsed = parseYaml(raw) as unknown;
        if (parsed === null || parsed === undefined) {
          return { section, present: true, count: 0, unreadable: false };
        }
        const count = Array.isArray(parsed) ? parsed.length : 1;
        return { section, present: true, count, unreadable: false };
      } catch {
        return { section, present: true, count: 0, unreadable: true };
      }
    }),
  );
}

function careerKbFindings(states: SectionState[]): Finding[] {
  const findings: Finding[] = [];

  const unreadable = states.filter((s) => s.unreadable);
  if (unreadable.length > 0) {
    findings.push({
      label: "Career KB files",
      status: "problem",
      detail: `${unreadable.map((s) => `${s.section}.yaml`).join(", ")} exist but are not valid YAML, so every tool that reads your Career KB will refuse to run rather than overwrite them.`,
      fix: "Open each one and fix the YAML, or restore the timestamped .bak sitting next to it.",
    });
  }

  const profile = states.find((s) => s.section === "profile");
  const populated = states.filter((s) => !s.unreadable && s.count > 0);
  // The journal is written by `capture_insight` as you go, not something a user
  // sits down and fills in, so its emptiness is never a gap worth nagging about.
  const emptyOrMissing = states.filter(
    (s) => !s.unreadable && s.count === 0 && s.section !== "journal",
  );

  const inventory = populated
    .map((s) => `${s.section} (${s.count})`)
    .join(", ");

  // Nothing saved anywhere: a genuinely new install, and the only case that
  // should be told there is no career data here.
  if (populated.length === 0) {
    findings.push({
      label: "Career KB",
      status: "warn",
      detail:
        "Nothing saved yet, so `tailor_resume`, `generate_cover_letter`, `explore_opportunity`, and `prepare_interview` have nothing to work from. This is the normal state of a fresh install.",
      fix: 'Paste in your resume and say "save this to my Career KB" — Claude extracts the structure and writes it with `save_career_section`.',
    });
    return findings;
  }

  // Profile missing but other sections written. This used to return the
  // fresh-install message above, which told someone who had already saved their
  // experience and skills that there was "no career data" here — the exact
  // self-blame this tool exists to prevent, aimed at a user who had done the
  // work. The profile is genuinely load-bearing (every KB-backed tool loads it
  // first and bails without it), so it still leads — but it is reported as the
  // one missing piece, next to what is already there.
  if (!profile?.present || profile.unreadable || profile.count === 0) {
    findings.push({
      label: "Career KB",
      status: "warn",
      detail:
        `Saved: ${inventory}. But profile.yaml is ${profile?.unreadable ? "unreadable" : "missing"}, and ` +
        "`tailor_resume`, `generate_cover_letter`, `explore_opportunity`, and `prepare_interview` all load " +
        "the profile before anything else — so they report no career data even though the rest of your KB is here.",
      fix: profile?.unreadable
        ? "Fix profile.yaml, or restore the timestamped .bak beside it — that alone unblocks every tool above."
        : "Run `save_career_section` with section 'profile' — that alone unblocks every tool above.",
    });
    return findings;
  }

  if (emptyOrMissing.length > 0) {
    findings.push({
      label: "Career KB",
      status: "warn",
      detail: `Populated: ${inventory}. Still empty: ${emptyOrMissing.map((s) => s.section).join(", ")}.`,
      fix: `Fill the gaps with \`save_career_section\` — every filled section sharpens resume tailoring and interview prep.`,
    });
  } else {
    findings.push({
      label: "Career KB",
      status: "ok",
      detail: `All sections populated: ${inventory}.`,
    });
  }

  return findings;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

async function pipelineFinding(): Promise<Finding> {
  try {
    const pipeline = await loadPipeline();
    const total = pipeline.applications.length;
    if (total === 0) {
      return {
        label: "Pipeline",
        status: "warn",
        detail: "No applications tracked yet.",
        fix: "Add the first one with `pipeline_add`, then run `career-compass-mcp dashboard` to watch it move.",
      };
    }
    const active = pipeline.applications.filter(
      (a) => a.status !== "rejected" && a.status !== "withdrawn" && a.status !== "accepted",
    ).length;
    return {
      label: "Pipeline",
      status: "ok",
      detail: `Parses cleanly — ${total} application${total === 1 ? "" : "s"}, ${active} still active.`,
    };
  } catch (error) {
    if (isCorruptDataError(error)) {
      return {
        label: "Pipeline",
        status: "problem",
        detail: `${error.filePath} exists but cannot be parsed, so the pipeline tools and the dashboard both refuse to run rather than overwrite it.`,
        fix: "Fix the YAML, or restore the timestamped .bak next to it.",
      };
    }
    return {
      label: "Pipeline",
      status: "problem",
      detail: `Could not read the pipeline: ${(error as Error).message}`,
      fix: "Check that your CAREER_DATA_PATH directory is readable.",
    };
  }
}

// ─── Orphaned temp files ──────────────────────────────────────────────────────

/**
 * Leftover `.tmp` files from an interrupted atomic write.
 *
 * `atomicWriteYaml` writes `.<name>.<uuid>.tmp` and renames it over the target.
 * If the process dies between those two steps the temp file survives, holding
 * data that never landed. Harmless to the tools — nothing reads them — but they
 * accumulate silently, and one of them may be the write a user thinks they made.
 */
async function orphanFinding(dataDir: string): Promise<Finding> {
  const dirs = [join(dataDir, "career"), join(dataDir, "pipeline")];
  const orphans: string[] = [];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith(".tmp")) orphans.push(join(dir, entry));
    }
  }

  if (orphans.length === 0) {
    return { label: "Temp files", status: "ok", detail: "No leftover .tmp files." };
  }
  return {
    label: "Temp files",
    status: "warn",
    detail: `${orphans.length} leftover .tmp file${orphans.length === 1 ? "" : "s"} from an interrupted write: ${orphans.slice(0, 3).join(", ")}${orphans.length > 3 ? ", …" : ""}`,
    fix: "Nothing reads these — delete them. If one holds a write you thought you made, copy the contents out first.",
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export type DashboardProbeResult =
  | { reachable: true; isCareerCompass: boolean }
  | { reachable: false; reason: string };

/** Injected so tests are deterministic. See {@link registerDoctorTools}. */
export type DashboardProbe = (port: number) => Promise<DashboardProbeResult>;

/**
 * Probe the local dashboard.
 *
 * Loopback only, so this never leaves the machine and is not the network call
 * PRIVACY.md's update-check section is about. A closed port refuses instantly,
 * so the timeout only matters when something is listening but wedged.
 */
export async function probeLocalDashboard(port: number, timeoutMs = 1500): Promise<DashboardProbeResult> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return { reachable: true, isCareerCompass: body.includes("Career Compass") };
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { reachable: false, reason: "timed out" };
    }
    return { reachable: false, reason: "nothing is listening" };
  }
}

function dashboardFinding(port: number, result: DashboardProbeResult): Finding {
  if (!result.reachable) {
    return {
      label: "Dashboard",
      status: "ok",
      detail: `Not running on port ${port} (${result.reason}). That's normal — it only runs while you have it open.`,
      fix: `Run \`npx career-compass-mcp dashboard\` to open it${port === DEFAULT_DASHBOARD_PORT ? "" : ` on port ${port}`}.`,
    };
  }
  if (!result.isCareerCompass) {
    return {
      label: "Dashboard",
      status: "warn",
      detail: `Something is listening on port ${port}, but it isn't the Career Compass dashboard.`,
      fix: `Start the dashboard on a free port: \`npx career-compass-mcp dashboard --port ${port + 1}\`.`,
    };
  }
  return {
    label: "Dashboard",
    status: "ok",
    detail: `Running at http://localhost:${port}.`,
  };
}

// ─── Report ───────────────────────────────────────────────────────────────────

/** Matches the CLI's default so a user who ran `dashboard` bare is found. */
export const DEFAULT_DASHBOARD_PORT = 3141;

export function renderReport(findings: Finding[], freshInstall: boolean): string {
  const lines: string[] = ["# Career Compass — Setup Check", ""];

  for (const f of findings) {
    lines.push(`${GLYPH[f.status]} **${f.label}** — ${f.detail}`);
    if (f.fix) lines.push(`   → ${f.fix}`);
  }

  const problems = findings.filter((f) => f.status === "problem").length;
  const warnings = findings.filter((f) => f.status === "warn").length;

  lines.push("");
  if (freshInstall) {
    // A brand-new install is not a broken one, and listing its empty sections as
    // faults is how a first-run experience teaches someone the tool is failing.
    lines.push(
      "**Getting started.** The install itself is fine — there's just no career data in it yet. " +
        "Paste your resume into this conversation and ask me to save it; I'll extract the structure " +
        "and write it with `save_career_section`. After that, add a role you're chasing with " +
        "`pipeline_add`, and everything else here has something to work with.",
    );
  } else if (problems > 0) {
    lines.push(`**${problems} thing${problems === 1 ? "" : "s"} to fix**${warnings > 0 ? `, plus ${warnings} worth a look` : ""}. Start with the ❌ above.`);
  } else if (warnings > 0) {
    lines.push(`**Nothing is broken.** ${warnings} thing${warnings === 1 ? "" : "s"} above would make Career Compass work better.`);
  } else {
    lines.push("**Everything checks out.**");
  }

  return lines.join("\n");
}

// ─── Registration ─────────────────────────────────────────────────────────────

export interface DoctorDeps {
  /** Defaults to {@link checkNpmForUpdate}. Tests inject a stub — the suite must never hit the network. */
  checkForUpdate?: UpdateChecker;
  /** Defaults to {@link probeLocalDashboard}. */
  probeDashboard?: DashboardProbe;
}

export function registerDoctorTools(server: McpServer, deps: DoctorDeps = {}): void {
  const checkForUpdate = deps.checkForUpdate ?? checkNpmForUpdate;
  const probeDashboard = deps.probeDashboard ?? probeLocalDashboard;

  server.registerTool(
    "check_setup",
    {
      title: "Check Career Compass Setup",
      // Reads files and asks the npm registry for a version number. It writes
      // nothing — the data-directory check is a permission probe, not a test
      // write — so a host may run it without prompting, which is the point:
      // "why isn't this working" should not itself require a permission step.
      // openWorldHint is true because of the registry call, and that is the
      // honest answer even though the call sends nothing about the user.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Health-check this Career Compass install and report everything at once: whether a newer version has shipped, whether your data directory exists and is writable, which Career KB sections are filled in, whether the pipeline file parses, leftover temp files, and whether the dashboard is running. Every finding comes with the one command that fixes it. Run this first whenever something seems wrong, or right after an install or upgrade.",
      inputSchema: {
        checkForUpdates: z
          .boolean()
          .default(true)
          .describe(
            "Whether to ask the public npm registry which version is current. This is the only outbound network call Career Compass ever makes: an unauthenticated GET for the package name, sending nothing about you or your data. Set false to run the check entirely offline.",
          ),
        dashboardPort: z
          .number()
          .int()
          .min(1)
          .max(65535)
          .default(DEFAULT_DASHBOARD_PORT)
          .describe(
            "Which loopback port to check for a running dashboard. Matches `career-compass-mcp dashboard --port`; the default is 3141.",
          ),
      },
    },
    async ({ checkForUpdates, dashboardPort }) => {
      const dataDir = getDataDir();
      const careerDir = join(dataDir, "career");

      // Both of these reach outside the process, and a diagnostic is most needed
      // exactly when things are failing — so a rejection from either must cost
      // its own finding, never the whole report. `checkNpmForUpdate` and
      // `probeLocalDashboard` already resolve rather than throw; this is the
      // belt to their braces, and it holds for an override that is less careful.
      const [update, sections, pipeline, orphans, dashboard] = await Promise.all([
        checkForUpdates
          ? checkForUpdate().catch((error: unknown) => ({
              ok: false as const,
              reason: `the update check itself failed (${(error as Error)?.message ?? String(error)})`,
            }))
          : Promise.resolve(null),
        readSectionStates(careerDir),
        pipelineFinding(),
        orphanFinding(dataDir),
        probeDashboard(dashboardPort).catch(
          (): DashboardProbeResult => ({ reachable: false, reason: "the check could not run" }),
        ),
      ]);

      const findings: Finding[] = [
        versionFinding(update),
        await dataDirFinding(dataDir),
        ...careerKbFindings(sections),
        pipeline,
        orphans,
        dashboardFinding(dashboardPort, dashboard),
      ];

      // "Fresh" means nothing has ever been saved — not merely that the profile
      // is absent. Keying this off the profile alone closed the report with
      // getting-started guidance for someone who had already written their
      // experience and skills, which reads as the tool not seeing their work.
      const hasAnyCareerData = sections.some((s) => s.count > 0);
      const freshInstall =
        !hasAnyCareerData && !findings.some((f) => f.status === "problem");

      return { content: [{ type: "text", text: renderReport(findings, freshInstall) }] };
    },
  );
}
