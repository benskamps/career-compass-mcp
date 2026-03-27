import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCareerResources } from "./resources/career-kb.js";
import { registerOpportunityTools } from "./tools/opportunity.js";
import { registerResumeTools } from "./tools/resume.js";
import { registerPipelineTools } from "./tools/pipeline.js";
import { registerInterviewTools } from "./tools/interview.js";
import { registerCareerKBTools } from "./tools/career-kb.js";
import { registerPrompts } from "./prompts/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "career-compass",
    version: "0.1.0",
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
