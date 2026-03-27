import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadCareerData, loadPipeline } from "../storage/file-store.js";

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
      const data = await loadCareerData();
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
      const data = await loadCareerData();
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
      const data = await loadCareerData();
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
      const data = await loadCareerData();
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
      const data = await loadCareerData();
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
      const data = await loadCareerData();
      return {
        contents: [{
          uri: "career://testimonials",
          mimeType: "application/json",
          text: JSON.stringify(data?.testimonials ?? [], null, 2),
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
      const data = await loadCareerData();
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
      const pipeline = await loadPipeline();
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

  const appTemplate = new ResourceTemplate("career://pipeline/{id}", { list: undefined });

  server.registerResource(
    "pipeline-application",
    appTemplate,
    {
      title: "Application Detail",
      description: "Full detail for a specific job application by ID",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      const pipeline = await loadPipeline();
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
