import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completeApplicationIdValues } from "../completions.js";
import { loadCareerData, loadPipeline, loadJournal, isCorruptDataError } from "../storage/file-store.js";
import { isWriteClaimUnavailable } from "../storage/write-claim.js";

/**
 * Surface a storage-layer failure as a resource payload instead of a raw throw.
 *
 * The pipeline *tools* already do this (`tools/pipeline.ts`, `tools/career-kb.ts`):
 * a corrupt file or a lost write claim means "nothing was read, and here is
 * why", and the one sentence that tells the user what to do — fix the file,
 * restore a `.bak` — must survive to them. A bare loader call in a resource
 * handler throws `CorruptDataError` straight into the transport, which drops
 * that sentence and shows an opaque protocol error for what is really a
 * recoverable, self-inflicted state. Reads take no write claim, so
 * `WriteClaimUnavailableError` is unlikely here, but it is handled for parity
 * with the tools so both surfaces answer the same failures the same way.
 *
 * Returns a resource-content payload for the known typed errors; rethrows
 * anything else, because an unexpected error should not be disguised as data.
 */
function resourceError(uri: string, error: unknown): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  if (isCorruptDataError(error) || isWriteClaimUnavailable(error)) {
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: (error as Error).message }, null, 2),
      }],
    };
  }
  throw error;
}

export function registerCareerResources(server: McpServer): void {

  // ── Static career resources ──────────────────────────────────────────────────

  server.registerResource(
    "career-profile",
    "career://profile",
    {
      title: "Career Profile",
      description: "Professional profile: name, contact, summary, target roles, and preferences",
      mimeType: "application/json",
    },
    async () => {
      let data;
      try {
        data = await loadCareerData();
      } catch (error) {
        return resourceError("career://profile", error);
      }
      return {
        contents: [{
          uri: "career://profile",
          mimeType: "application/json",
          text: JSON.stringify(data?.profile ?? null, null, 2),
        }],
      };
    }
  );

  server.registerResource(
    "career-experience",
    "career://experience",
    {
      title: "Work Experience",
      description: "Full work history with roles, achievements, and impact metrics",
      mimeType: "application/json",
    },
    async () => {
      let data;
      try {
        data = await loadCareerData();
      } catch (error) {
        return resourceError("career://experience", error);
      }
      return {
        contents: [{
          uri: "career://experience",
          mimeType: "application/json",
          text: JSON.stringify(data?.experience ?? [], null, 2),
        }],
      };
    }
  );

  server.registerResource(
    "career-skills",
    "career://skills",
    {
      title: "Skills Inventory",
      description: "All skills with categories, proficiency levels, and recency",
      mimeType: "application/json",
    },
    async () => {
      let data;
      try {
        data = await loadCareerData();
      } catch (error) {
        return resourceError("career://skills", error);
      }
      return {
        contents: [{
          uri: "career://skills",
          mimeType: "application/json",
          text: JSON.stringify(data?.skills ?? [], null, 2),
        }],
      };
    }
  );

  server.registerResource(
    "career-projects",
    "career://projects",
    {
      title: "Project Portfolio",
      description: "Key projects with descriptions, technologies, and outcomes",
      mimeType: "application/json",
    },
    async () => {
      let data;
      try {
        data = await loadCareerData();
      } catch (error) {
        return resourceError("career://projects", error);
      }
      return {
        contents: [{
          uri: "career://projects",
          mimeType: "application/json",
          text: JSON.stringify(data?.projects ?? [], null, 2),
        }],
      };
    }
  );

  server.registerResource(
    "career-education",
    "career://education",
    {
      title: "Education & Certifications",
      description: "Degrees, certifications, and relevant coursework",
      mimeType: "application/json",
    },
    async () => {
      let data;
      try {
        data = await loadCareerData();
      } catch (error) {
        return resourceError("career://education", error);
      }
      return {
        contents: [{
          uri: "career://education",
          mimeType: "application/json",
          text: JSON.stringify(data?.education ?? [], null, 2),
        }],
      };
    }
  );

  server.registerResource(
    "career-testimonials",
    "career://testimonials",
    {
      title: "Testimonials & Awards",
      description: "Quotes from managers/peers, awards, and recognition",
      mimeType: "application/json",
    },
    async () => {
      let data;
      try {
        data = await loadCareerData();
      } catch (error) {
        return resourceError("career://testimonials", error);
      }
      return {
        contents: [{
          uri: "career://testimonials",
          mimeType: "application/json",
          text: JSON.stringify(data?.testimonials ?? [], null, 2),
        }],
      };
    }
  );

  // ── Career journal ───────────────────────────────────────────────────────────

  /**
   * The append-only journal of career signals (`capture_insight` writes here).
   *
   * It is a section of the merged KB — `career://full` includes it — but until
   * now it had no resource of its own, so a host could read every other section
   * directly and never the journal. This mirrors the seven section resources
   * above, reading through the existing {@link loadJournal} loader with the same
   * fail-closed posture: a corrupt `journal.yaml` surfaces as a resource payload
   * naming the problem, not a raw transport error.
   *
   * Registering it is also what gives `live.ts`'s `FILE_TO_URI` a target for
   * `journal.yaml`, so an append can dirty both `career://journal` and
   * `career://full` for a subscriber.
   */
  server.registerResource(
    "career-journal",
    "career://journal",
    {
      title: "Career Journal",
      description: "Append-only log of career signals and captured insights",
      mimeType: "application/json",
    },
    async () => {
      let journal;
      try {
        journal = await loadJournal();
      } catch (error) {
        return resourceError("career://journal", error);
      }
      return {
        contents: [{
          uri: "career://journal",
          mimeType: "application/json",
          text: JSON.stringify(journal, null, 2),
        }],
      };
    }
  );

  server.registerResource(
    "career-full",
    "career://full",
    {
      title: "Full Career Knowledge Base",
      description: "Complete SSOT: profile, experience, skills, projects, education, testimonials",
      mimeType: "application/json",
    },
    async () => {
      let data;
      try {
        data = await loadCareerData();
      } catch (error) {
        return resourceError("career://full", error);
      }
      return {
        contents: [{
          uri: "career://full",
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        }],
      };
    }
  );

  // ── Pipeline resources ───────────────────────────────────────────────────────

  server.registerResource(
    "pipeline-overview",
    "career://pipeline",
    {
      title: "Application Pipeline",
      description: "All job applications with status, contacts, interview rounds, and offers",
      mimeType: "application/json",
    },
    async () => {
      let pipeline;
      try {
        pipeline = await loadPipeline();
      } catch (error) {
        return resourceError("career://pipeline", error);
      }
      const statusCounts = pipeline.applications.reduce((acc, app) => {
        acc[app.status] = (acc[app.status] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        contents: [{
          uri: "career://pipeline",
          mimeType: "application/json",
          text: JSON.stringify({
            summary: { total: pipeline.applications.length, byStatus: statusCounts, lastUpdated: pipeline.lastUpdated },
            applications: pipeline.applications,
          }, null, 2),
        }],
      };
    }
  );

  // ── Per-application resource ─────────────────────────────────────────────────

  /**
   * The per-application template gains the two things it was missing: a listing,
   * so applications are browsable rather than only guessable, and a completion
   * for `id`.
   *
   * The completion had a false start worth recording. The obvious home for it is
   * `pipeline_update`'s `id` argument — the one value a model cannot reason its
   * way to. That does nothing: MCP's `completion/complete` takes `ref/prompt`
   * and `ref/resource` and there is no `ref/tool`, so a `completable()` tool
   * argument type-checks, registers, and is never consulted. A real stdio client
   * asking for it got `-32601 Method not found`, because with nothing completable
   * anywhere the SDK never installs the handler at all. A URI template is where
   * the protocol actually looks — which is why the completion lives on the
   * `career://pipeline/{id}` template below.
   *
   * One URI space, not two: an application is addressed only as
   * `career://pipeline/{id}`. An early alternative that gave applications a
   * second, parallel URI space was dropped before it shipped — two URI spaces
   * for one thing is the kind of duplicate that outlives whoever introduced it.
   */
  const appTemplate = new ResourceTemplate("career://pipeline/{id}", {
    list: async () => {
      const pipeline = await loadPipeline();
      return {
        resources: pipeline.applications.map((app) => ({
          uri: `career://pipeline/${app.id}`,
          name: `${app.company} — ${app.role}`,
          description: `Status: ${app.status}`,
          mimeType: "application/json",
        })),
      };
    },
    complete: {
      id: (value) => completeApplicationIdValues(value ?? ""),
    },
  });

  server.registerResource(
    "pipeline-application",
    appTemplate,
    {
      title: "Application Detail",
      description: "Full detail for a specific job application by ID",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      let pipeline;
      try {
        pipeline = await loadPipeline();
      } catch (error) {
        return resourceError(uri.href, error);
      }
      const app = pipeline.applications.find(a => a.id === id);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(app ?? { error: `Application ${id} not found` }, null, 2),
        }],
      };
    }
  );
}
