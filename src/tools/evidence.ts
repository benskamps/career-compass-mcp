import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { harvestEvidence, NotARepoError, type HarvestReport } from "../evidence.js";

/**
 * `harvest_evidence` — read a project's git history and report what is in it.
 *
 * Deliberately read-only, and deliberately does not write to the Career KB. See
 * the module comment in `src/evidence.ts` for why that separation is the whole
 * design: the model proposes, the user approves, `capture_insight` writes.
 */

function bar(n: number, max: number, width = 18): string {
  if (max <= 0) return "";
  return "█".repeat(Math.max(1, Math.round((n / max) * width)));
}

/** Render the report as something a person can actually read and check. */
export function formatReport(r: HarvestReport): string {
  const lines: string[] = [];

  lines.push(`# Evidence in \`${r.repo}\``);
  lines.push("");
  lines.push(
    `\`${r.path}\`${r.branch ? ` · branch \`${r.branch}\`` : ""} · since ${r.window.since}`,
  );
  lines.push("");

  if (r.measurements.length === 0) {
    lines.push(
      "**Nothing measurable in this window.** Either no commits match the author identity, or the window is too narrow. Try a wider `since`, or pass `authorEmail` if you commit under a different address here.",
    );
  } else {
    lines.push("## What is measurably true");
    lines.push("");
    for (const m of r.measurements) {
      lines.push(`- **${m.claim}**`);
      lines.push(`  - _how:_ ${m.evidence}`);
    }
    lines.push("");
  }

  if (r.languages.length > 0) {
    const max = r.languages[0].files;
    lines.push("## Where the work was");
    lines.push("");
    lines.push("```");
    for (const l of r.languages) {
      lines.push(`.${l.ext.padEnd(6)} ${String(l.files).padStart(4)}  ${bar(l.files, max)}`);
    }
    lines.push("```");
    if (r.surfaces.length > 0) {
      lines.push("");
      lines.push(
        `Top surfaces: ${r.surfaces.slice(0, 5).map((s) => `\`${s.dir}/\` (${s.files})`).join(", ")}`,
      );
    }
    lines.push("");
  }

  lines.push("## What this cannot tell you");
  lines.push("");
  for (const q of r.questions) lines.push(`- ${q}`);
  lines.push("");

  lines.push("## Limits");
  lines.push("");
  for (const n of r.notes) lines.push(`- ${n}`);
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push(
    "**Instructions for Claude:** Do NOT turn the numbers above into résumé bullets on your own, " +
      "and do NOT call `capture_insight` yet. Counts are participation, not impact — a large refactor " +
      "and a large reformat are identical to git. Instead, put the questions above to the user, one or " +
      "two at a time, and use their answers to find the achievement the log cannot see. Only once the " +
      "user has supplied the outcome should you offer to record it with `capture_insight` as a " +
      "`skill_evidence` entry, quoting the measurement that supports it.",
  );

  return lines.join("\n");
}

export function registerEvidenceTools(server: McpServer): void {
  server.registerTool(
    "harvest_evidence",
    {
      title: "Harvest Evidence From a Project",
      // Reads a local git repository and reports counts. Writes nothing, anywhere:
      // not to the repo, not to the Career KB. The user's approval is the write step.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Read a local project's git history and report what you measurably did there — months active, " +
        "files and file types touched, your share of commits, test ratio — each with the command that " +
        "produced it. Use it when the user cannot remember what they shipped, is writing a résumé bullet " +
        "for a project, or needs proof of a skill. It reports counts and asks the questions a commit log " +
        "cannot answer; it never invents achievements and never writes to the Career KB.",
      inputSchema: {
        projectPath: z
          .string()
          .describe("Absolute path to the project directory (the git repository root)"),
        since: z
          .string()
          .optional()
          .describe("ISO date (YYYY-MM-DD) to look back to. Defaults to two years ago."),
        authorEmail: z
          .string()
          .optional()
          .describe(
            "Email to attribute commits to. Defaults to that repository's own git user.email. " +
              "Pass it when you commit there under a different address, or the counts will be zero.",
          ),
      },
    },
    async ({ projectPath, since, authorEmail }) => {
      try {
        const report = harvestEvidence({ projectPath, since, authorEmail });
        return { content: [{ type: "text" as const, text: formatReport(report) }] };
      } catch (error) {
        if (error instanceof NotARepoError) {
          return { content: [{ type: "text" as const, text: `❌ ${error.message}` }] };
        }
        // A missing `git` binary is the other likely failure and is worth naming
        // rather than surfacing as a raw spawn error.
        const msg = (error as Error)?.message ?? String(error);
        return {
          content: [
            {
              type: "text" as const,
              text:
                `❌ Could not read that project: ${msg}\n\n` +
                `This tool shells out to \`git\`. If git is not on PATH for this server's process, nothing here will work.`,
            },
          ],
        };
      }
    },
  );
}
