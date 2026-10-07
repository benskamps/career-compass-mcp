import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCareerResources } from "./resources/career-kb.js";
import { registerLiveResources } from "./resources/live.js";
import { registerOpportunityTools } from "./tools/opportunity.js";
import { registerResumeTools } from "./tools/resume.js";
import { registerPipelineTools } from "./tools/pipeline.js";
import { registerInterviewTools } from "./tools/interview.js";
import { registerCareerKBTools } from "./tools/career-kb.js";
import { registerDoctorTools, type DoctorDeps } from "./tools/doctor.js";
import { registerEvidenceTools } from "./tools/evidence.js";
import { registerPrompts } from "./prompts/index.js";
import { PKG_VERSION } from "./version.js";
import { SERVER_INSTRUCTIONS } from "./server-instructions.js";
import { unreadableCareerSections } from "./storage/file-store.js";

export interface ServerOptions {
  /**
   * Overrides for the two outside-world calls `check_setup` makes: the npm
   * registry lookup and the loopback dashboard probe.
   *
   * They are injectable because a test suite that reaches the network is a test
   * suite that fails on a plane, and because "what does this report when npm is
   * three versions ahead" is otherwise unassertable. Production passes nothing
   * and gets the real implementations.
   */
  doctor?: DoctorDeps;
}

export function createServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "career-compass",
    // Resolved from package.json — never hardcode. A literal here drifts the
    // moment the package is bumped, and the client has no way to notice.
    version: PKG_VERSION,
  }, {
    instructions: SERVER_INSTRUCTIONS,
  });

  noticeUnreadableSections(server);

  // Resources — Career KB + Pipeline
  registerCareerResources(server);

  // …and their live half: subscribe to a resource and the server tells you when
  // the file behind it changes on disk, whoever changed it — vim, the dashboard,
  // or another tool call. Lazy: nothing is watched until a host subscribes, so a
  // host that never does pays nothing. See resources/live.ts.
  registerLiveResources(server);

  // Tools — Discovery & Research
  registerOpportunityTools(server);

  // Tools — Resume & Application
  registerResumeTools(server);

  // Tools — Pipeline Management & Email
  registerPipelineTools(server);

  // Tools — Interview & Offer
  registerInterviewTools(server);

  // Tools — Career KB Management
  registerCareerKBTools(server);

  // Tools — Evidence from the user's own repositories
  registerEvidenceTools(server);

  // Tools — Install health
  registerDoctorTools(server, options.doctor);

  // Prompts — Power user shortcuts
  registerPrompts(server);

  return server;
}

/** Tools whose answers rest on the Career KB. */
const KB_READERS = new Set([
  "explore_opportunity", "research_company", "tailor_resume", "generate_cover_letter",
  "prepare_interview", "interview_arc",
]);

/**
 * Prefix KB-backed tool results with a warning when a section file can't be read.
 *
 * Done once here rather than in each handler: the loader turns a broken optional
 * section into an empty list, and without this every one of these tools would
 * answer from that empty list as if it were the truth ("no work history"). The
 * warning tells the model and the user why, and save_career_section refuses to
 * write over the broken file.
 */
function noticeUnreadableSections(server: McpServer): void {
  const register = server.registerTool.bind(server) as (...a: unknown[]) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (name: string, config: unknown, cb: (...a: any[]) => any) => {
    if (!KB_READERS.has(name)) return register(name, config, cb);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return register(name, config, async (...args: any[]) => {
      const result = await cb(...args);
      if (result?.isError || !Array.isArray(result?.content)) return result;
      const bad = await unreadableCareerSections().catch(() => []);
      if (bad.length === 0) return result;
      const files = bad.map((s) => `${s}.yaml`).join(", ");
      const notice =
        `⚠️ ${files} couldn't be read (likely a typing slip in a hand edit), so this answer can't ` +
        `see ${bad.length === 1 ? "that section" : "those sections"}. Treat it as missing data, not as ` +
        `something the user lacks. Run check_setup for the exact problem, or restore the newest .bak ` +
        `next to the file.`;
      return { ...result, content: [{ type: "text", text: notice }, ...result.content] };
    });
  };
}
