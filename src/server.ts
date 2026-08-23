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
  });

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
