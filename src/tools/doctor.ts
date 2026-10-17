import { z } from "zod";
import { access, readdir, readFile } from "fs/promises";
import { constants as FS } from "fs";
import { execFile } from "child_process";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { promisify } from "util";
import { parse as parseYaml } from "yaml";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDataDir, loadPipeline, isCorruptDataError, CAREER_SECTIONS, listCareerBackups, type BackupInfo } from "../storage/file-store.js";
import { inspectWriteClaim } from "../storage/write-claim.js";
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
 * `unknown` is a first-class status, not a failure: a check that cannot run
 * (the dashboard probe, say) is not a broken install, and rendering that as ❌
 * would teach users to ignore ❌.
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

// ─── Version ──────────────────────────────────────────────────────────────────

/**
 * The installed version, and how a newer one arrives. No registry call: the
 * plugin updates through the directory, and a server that never opens a
 * connection is the only way "nothing leaves your machine" stays literally true.
 */
function versionFinding(): Finding {
  return {
    label: "Version",
    status: "ok",
    detail:
      `v${PKG_VERSION} installed. The Claude plugin updates itself; set up with npx or \`install\`, ` +
      "run `npx -y career-compass-mcp@latest install` and restart your client to update.",
  };
}

// ─── Git check ────────────────────────────────────────────────────────────────

const execFileAsync = promisify(execFile);

/**
 * Checks whether the data directory lives inside a git repo.
 *
 * Career KB data is plain YAML on disk — version-controlling it with git gives
 * users free backup, diff history, and the ability to `git stash` before a big
 * restructure. This finding nudges them toward it rather than leaving it as an
 * undiscoverable best practice. It is `warn`, never `problem` — the lack of git
 * is not an error, only an opportunity, and the report's summary line already
 * words a warn-only report as "nothing is broken".
 *
 * Only the one stderr git prints for "no repo here" earns the tip. Every other
 * failure — git not installed, the data dir not created yet, a "dubious
 * ownership" refusal, a timeout — returns null and the finding is omitted:
 * a health check must not diagnose "no repository" from an error that says
 * something else.
 */
async function gitFinding(dataDir: string): Promise<Finding | null> {
  try {
    await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: dataDir, timeout: 2000 });
    // Git IS tracking this directory — confirm it so the user knows backups are in play.
    return {
      label: "Git backup",
      status: "ok",
      detail: `${dataDir} is tracked in a git repository — your career data has version history.`,
    };
  } catch (err: unknown) {
    const e = err as { stderr?: unknown; message?: string };
    const msg = `${typeof e.stderr === "string" ? e.stderr : ""}\n${e.message ?? ""}`;
    if (msg.includes("not a git repository")) {
      return {
        label: "Git backup",
        status: "unknown",
        detail: `${dataDir} is not a git repository.`,
        // Three plain lines, not a `&&` chain: the chain fails in Windows
        // PowerShell 5.1, which is the default shell on the boxes that hit
        // this most. Same per-shell honesty the dashboard tips below keep.
        fix: `Turn it into one, in any shell:\n  git init "${dataDir}"\n  git -C "${dataDir}" add -A\n  git -C "${dataDir}" commit -m "initial career kb"\nThat gives you free backup and a diff history for all your career data.`,
      };
    }
    return null;
  }
}

// ─── Data directory ───────────────────────────────────────────────────────────

async function dataDirFinding(dataDir: string): Promise<Finding> {
  try {
    await access(dataDir, FS.F_OK);
  } catch {
    // Not created yet is normal: the first save creates it. What matters is
    // whether that save could, so check the nearest folder that does exist.
    let parent = dirname(dataDir);
    for (;;) {
      try {
        await access(parent, FS.F_OK);
        break;
      } catch {
        const up = dirname(parent);
        if (up === parent) break;
        parent = up;
      }
    }
    try {
      await access(parent, FS.W_OK);
    } catch {
      return {
        label: "Data directory",
        status: "problem",
        detail: `${dataDir} does not exist, and ${parent} is not writable, so the first save would fail.`,
        fix: "Point CAREER_DATA_PATH at a directory you own.",
      };
    }
    return {
      label: "Data directory",
      status: "ok",
      detail: `${dataDir} does not exist yet; it is created the first time you save something.`,
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

/** Sections filled in as the search goes, never in one sitting. */
const GROWS_AS_YOU_GO = new Set(["journal", "narrative", "stories", "people"]);

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
  // Narrative, stories and people fill up the same way, one answer or one
  // interview at a time, so an empty one is not a gap either.
  const emptyOrMissing = states.filter(
    (s) => !s.unreadable && s.count === 0 && !GROWS_AS_YOU_GO.has(s.section),
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
      detail: `Populated: ${inventory}.`,
    });
  }

  return findings;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * The pipeline finding, plus how many applications it holds (0 when it can't be
 * read). The count decides two things in the report: whether this is a fresh
 * install, and whether the optional feedback line is shown.
 *
 * An empty pipeline used to come with "add the first one with `pipeline_add`"
 * and a dashboard command. That is homework, handed over in a health check, and
 * the model tended to repeat it to someone who had only asked a question.
 */
async function pipelineFinding(): Promise<{ finding: Finding; total: number }> {
  try {
    const pipeline = await loadPipeline();
    const total = pipeline.applications.length;
    if (total === 0) {
      return { total, finding: { label: "Pipeline", status: "ok", detail: "No applications tracked yet." } };
    }
    const active = pipeline.applications.filter(
      (a) => a.status !== "rejected" && a.status !== "withdrawn" && a.status !== "accepted",
    ).length;
    return {
      total,
      finding: {
        label: "Pipeline",
        status: "ok",
        detail: `Parses cleanly — ${total} application${total === 1 ? "" : "s"}, ${active} still active.`,
      },
    };
  } catch (error) {
    if (isCorruptDataError(error)) {
      return {
        total: 0,
        finding: {
          label: "Pipeline",
          status: "problem",
          detail: `${error.filePath} exists but cannot be parsed, so the pipeline tools and the dashboard both refuse to run rather than overwrite it.`,
          fix: "Fix the YAML, or restore the timestamped .bak next to it.",
        },
      };
    }
    return {
      total: 0,
      finding: {
        label: "Pipeline",
        status: "problem",
        detail: `Could not read the pipeline: ${(error as Error).message}`,
        fix: "Check that your CAREER_DATA_PATH directory is readable.",
      },
    };
  }
}

// ─── Backups ──────────────────────────────────────────────────────────────────

/** `2026-10-07T14:03:11.482Z` → `2026-10-07 14:03 UTC`. */
function backupTime(iso: string): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "time unknown";
}

/**
 * The recent `.bak` copies of each KB section, and how to put one back.
 *
 * Every save has kept one since the first release, and every error message said
 * "restore the .bak" — to people who do not know what a .bak is or which of five
 * to pick. Listing them with a time and an entry count lets the user point at
 * "the one from before it dropped to one role", and `restoreFrom` does the rest.
 */
export function backupsFinding(files: Array<{ file: string; backups: BackupInfo[] }>): Finding | null {
  if (files.length === 0) return null;
  const lines = files.flatMap(({ file, backups }) => [
    `${file}:`,
    ...backups.map((b) =>
      `  ${backupTime(b.takenAt)} · ${b.entries === null ? "unreadable" : `${b.entries} ${b.entries === 1 ? "entry" : "entries"}`} · ${b.name}`),
  ]);
  return {
    label: "Backups",
    status: "ok",
    detail: `Recent copies kept before each save, newest first:\n${lines.join("\n")}`,
    fix:
      "To undo a bad save, call `save_career_section` with that section and `restoreFrom` set to the backup's " +
      "file name. The current file is backed up first, so a restore can be undone too.",
  };
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
  // The data-dir ROOT is scanned too, not only its two subdirectories. An
  // external review pointed out that this scan — the one tool built to find
  // leftover temp files — could not see leftovers written beside `career/` and
  // `pipeline/` rather than inside them. That is a blind spot whether or not
  // anything currently writes there.
  const dirs = [dataDir, join(dataDir, "career"), join(dataDir, "pipeline")];
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

/**
 * Is another process holding the write claim right now?
 *
 * The claim is the answer to "why did my save say unavailable?", so `check_setup`
 * should be able to say it out loud. A stale claim is reported as clean because
 * it is: the next write breaks it automatically.
 */
async function writeClaimFinding(dataDir: string): Promise<Finding> {
  const holder = await inspectWriteClaim(dataDir);
  if (!holder) {
    return { label: "Write claim", status: "ok", detail: "No other process is writing this folder." };
  }
  const mine = holder.pid === process.pid;
  return {
    label: "Write claim",
    status: mine ? "ok" : "warn",
    detail: mine
      ? `Held by this process (pid ${holder.pid}).`
      : `Held by ${holder.holder} (pid ${holder.pid}) since ${holder.acquiredAt}. Saves will report unavailable until it finishes.`,
    fix: mine ? undefined : "Close the other Career Compass dashboard or MCP server, or wait — a claim from a dead process expires on its own.",
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
 * Loopback only, so this never leaves the machine. A closed port refuses instantly,
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

/**
 * The command to open the dashboard on *this* install's data folder.
 *
 * The dashboard reads `CAREER_DATA_PATH`, and there is no `--data` flag — so a
 * bare `npx career-compass-mcp dashboard` serves whatever that variable says in
 * the shell the user happens to be typing in, which is not the one the MCP
 * server was launched with. This tool has just printed the real folder two
 * lines above; recommending a command that ignores it sent anyone with a custom
 * folder to an empty board and a freshly created `~/.career-compass`.
 *
 * Both shells, because the manifest declares win32 alongside darwin and linux
 * and a `VAR=value command` prefix is a syntax error in PowerShell. The prefix
 * is omitted entirely when the folder is the default one, where it would be
 * noise that obscures the actual command.
 */
export function dashboardCommand(dataDir: string, port: number): string {
  const flags = port === DEFAULT_DASHBOARD_PORT ? "" : ` --port ${port}`;
  // Pinned to the running version: a bare package name runs whatever is newest
  // on npm, which is not the release this server is, and not the one a
  // directory reviewer checked.
  const command = `npx -y career-compass-mcp@${PKG_VERSION} dashboard${flags}`;
  if (resolve(dataDir) === resolve(join(homedir(), ".career-compass"))) return command;
  return (
    `PowerShell:  $env:CAREER_DATA_PATH="${dataDir}"; ${command}\n` +
    `bash/zsh:    CAREER_DATA_PATH="${dataDir}" ${command}`
  );
}

function dashboardFinding(dataDir: string, port: number, result: DashboardProbeResult): Finding {
  if (!result.reachable) {
    // No command here: a dashboard that isn't running is not a finding to act
    // on, and a two-shell npx command under a green tick read as homework.
    return {
      label: "Dashboard",
      status: "ok",
      detail: `Not running on port ${port} (${result.reason}). That's normal — it only runs while you have it open.`,
    };
  }
  if (!result.isCareerCompass) {
    return {
      label: "Dashboard",
      status: "warn",
      detail: `Something is listening on port ${port}, but it isn't the Career Compass dashboard.`,
      fix: `Start the dashboard on a free port:\n${dashboardCommand(dataDir, port + 1)}`,
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

/** Where the author hears that it helped. Shown only on a healthy install in real use. */
export const FEEDBACK_LINE =
  "If Career Compass helped, a GitHub star or a two-line note in Discussions " +
  "(https://github.com/benskamps/career-compass-mcp/discussions) is the only way the author hears about it. " +
  "Nothing is sent automatically.";

/**
 * Which way this server was started, from the one variable that tells them
 * apart. Claude Code exports `CLAUDE_PLUGIN_ROOT` to the stdio servers a plugin
 * declares; a server added by hand (Desktop config, `claude mcp add`, the
 * `.mcpb`) never has it. "Which install am I on?" is the first question of
 * every support thread, and the answer used to take three messages.
 *
 * Takes the one value, not the whole environment: this file also checks npm for
 * a newer version, and the directory's scan reads `process.env` next to a
 * `fetch` as a credential that could leave the machine.
 */
export function runningSurface(pluginRoot: string | undefined = process.env.CLAUDE_PLUGIN_ROOT): string {
  return pluginRoot?.trim()
    ? `Running from the Career Compass plugin v${PKG_VERSION}`
    : `Running as a standalone MCP server v${PKG_VERSION}`;
}

export interface ReportContext {
  /** {@link runningSurface}'s line. */
  surface?: string;
  /** Data directory, named in the fresh-install form. */
  dataDir?: string;
  /** Applications in the pipeline; the feedback line needs at least one. */
  applications?: number;
}

/**
 * The fresh-install form: three lines, no homework.
 *
 * On a brand-new install the full report was about 25 lines of git commands,
 * dashboard commands and "add a role with `pipeline_add`", injected into the
 * model's context right as it wrote its first reply (council 2.9.7, activation
 * note, doctor.ts:257 and :640). None of it is wrong, and none of it is what a
 * new user needs before their first answer. Anything that does need attention
 * (leftover temp files, say) still gets its line.
 */
function renderFresh(findings: Finding[], ctx: ReportContext): string {
  const lines = [
    "# Career Compass — Setup Check",
    "",
    `✅ ${ctx.surface ?? runningSurface()}. The data folder is ready: ${ctx.dataDir ?? getDataDir()}`,
    "Nothing is saved yet, which is normal for a fresh install. Nothing is broken.",
    "**Getting started:** paste a résumé (and a job posting, if you have one) and ask a question; " +
      "Claude answers from it, then offers to save your background with `save_career_section`.",
  ];
  for (const f of findings) {
    if (f.status === "warn" && f.label !== "Career KB") lines.push(`${GLYPH[f.status]} **${f.label}** — ${f.detail}`);
  }
  return lines.join("\n");
}

export function renderReport(findings: Finding[], freshInstall: boolean, ctx: ReportContext = {}): string {
  if (freshInstall) return renderFresh(findings, ctx);

  const lines: string[] = ["# Career Compass — Setup Check", ""];
  if (ctx.surface) lines.push(ctx.surface + ".", "");

  for (const f of findings) {
    // A detail may run to several lines (the backup list). Continuation lines
    // are indented so they don't read as findings of their own.
    const [head, ...more] = f.detail.split("\n");
    lines.push(`${GLYPH[f.status]} **${f.label}** — ${head}`);
    for (const line of more) lines.push(`     ${line}`);
    if (f.fix) {
      // A fix may run to several lines when it spells out a command per shell.
      // Continuation lines are indented under the arrow rather than falling
      // back to column zero, where they read as a new finding.
      const [first, ...rest] = f.fix.split("\n");
      lines.push(`   → ${first}`);
      for (const line of rest) lines.push(`     ${line}`);
    }
  }

  const problems = findings.filter((f) => f.status === "problem").length;
  const warnings = findings.filter((f) => f.status === "warn").length;

  lines.push("");
  if (problems > 0) {
    lines.push(`**${problems} thing${problems === 1 ? "" : "s"} to fix**${warnings > 0 ? `, plus ${warnings} worth a look` : ""}. Start with the ❌ above.`);
  } else if (warnings > 0) {
    lines.push(`**Nothing is broken.** ${warnings} thing${warnings === 1 ? "" : "s"} above would make Career Compass work better.`);
  } else {
    lines.push("**Everything checks out.**");
  }

  // One optional line, only for someone actually using it: healthy, and with at
  // least one application tracked. No telemetry exists, so this is the only way
  // the author learns it helped — and it is said plainly that nothing is sent.
  if (problems === 0 && (ctx.applications ?? 0) > 0) {
    lines.push("", FEEDBACK_LINE);
  }

  return lines.join("\n");
}

// ─── Registration ─────────────────────────────────────────────────────────────

export interface DoctorDeps {
  /** Defaults to {@link probeLocalDashboard}. */
  probeDashboard?: DashboardProbe;
}

export function registerDoctorTools(server: McpServer, deps: DoctorDeps = {}): void {
  const probeDashboard = deps.probeDashboard ?? probeLocalDashboard;

  server.registerTool(
    "check_setup",
    {
      title: "Check Career Compass Setup",
      // Reads files and probes the local dashboard port. It writes nothing —
      // the data-directory check is a permission probe, not a test write — so
      // a host may run it without prompting, which is the point: "why isn't
      // this working" should not itself require a permission step. Nothing
      // here leaves the machine, so openWorldHint is false like every tool.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Health-check this Career Compass install and report everything at once: how it is running (plugin or standalone) and its version, whether your data directory exists and is writable, which Career KB sections are filled in, the recent backups of each section with how to restore one, whether the pipeline file parses, leftover temp files, and whether the dashboard is running. Every finding that needs action comes with the one step that fixes it. Run it when something seems wrong, when the user asks whether it's working, or to find a backup to restore; not on first contact. Writes nothing.",
      inputSchema: {
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
    async ({ dashboardPort }) => {
      const dataDir = getDataDir();
      const careerDir = join(dataDir, "career");

      // A diagnostic is most needed exactly when things are failing, so a
      // rejection from any check must cost its own finding, never the whole
      // report. `probeLocalDashboard` already resolves rather than throws; this
      // is the belt to its braces, and it holds for an override that is less careful.
      const [sections, pipeline, orphans, claim, dashboard, git, backups] = await Promise.all([
        readSectionStates(careerDir),
        pipelineFinding(),
        orphanFinding(dataDir),
        writeClaimFinding(dataDir),
        probeDashboard(dashboardPort).catch(
          (): DashboardProbeResult => ({ reachable: false, reason: "the check could not run" }),
        ),
        gitFinding(dataDir),
        listCareerBackups().catch(() => []),
      ]);

      const backupFinding = backupsFinding(backups);
      const findings: Finding[] = [
        versionFinding(),
        await dataDirFinding(dataDir),
        ...(git ? [git] : []),
        ...careerKbFindings(sections),
        ...(backupFinding ? [backupFinding] : []),
        pipeline.finding,
        orphans,
        claim,
        dashboardFinding(dataDir, dashboardPort, dashboard),
      ];

      // "Fresh" means nothing has ever been saved — not merely that the profile
      // is absent. Keying this off the profile alone closed the report with
      // getting-started guidance for someone who had already written their
      // experience and skills, which reads as the tool not seeing their work.
      // A tracked application counts as use too: someone with a pipeline and no
      // KB gets the full report, not the first-run form.
      const hasAnyCareerData = sections.some((s) => s.count > 0);
      const freshInstall =
        !hasAnyCareerData && pipeline.total === 0 && !findings.some((f) => f.status === "problem");

      const text = renderReport(findings, freshInstall, {
        surface: runningSurface(),
        dataDir,
        applications: hasAnyCareerData ? pipeline.total : 0,
      });
      return { content: [{ type: "text", text }] };
    },
  );
}
