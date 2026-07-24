import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCareerResources } from "./resources/career-kb.js";
import { registerOpportunityTools } from "./tools/opportunity.js";
import { registerResumeTools } from "./tools/resume.js";
import { registerPipelineTools } from "./tools/pipeline.js";
import { registerInterviewTools } from "./tools/interview.js";
import { registerCareerKBTools } from "./tools/career-kb.js";
import { registerPrompts } from "./prompts/index.js";
import { PKG_VERSION } from "./version.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "career-compass",
    // Resolved from package.json — never hardcode. A literal here drifts the
    // moment the package is bumped, and the client has no way to notice.
    version: PKG_VERSION,
  });

  // Resources — Career KB + Pipeline
  registerCareerResources(server);

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

  // Prompts — Power user shortcuts
  registerPrompts(server);

  return server;
}
