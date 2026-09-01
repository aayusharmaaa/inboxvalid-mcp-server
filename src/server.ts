import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { VerificationService } from "./verification.js";

/**
 * Thin MCP adapter: validate tool input, delegate to VerificationService, return result.
 * No business logic belongs here.
 */
export function createMcpServer(service: VerificationService): McpServer {
  throw new Error("createMcpServer not implemented");
}

export async function startServer(): Promise<void> {
  throw new Error("startServer not implemented");
}

async function main(): Promise<void> {
  await startServer();
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
