import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MockProviderClient } from "./client.js";
import {
  loadConfig,
  ProviderError,
  verificationResultSchema,
  verificationStatusSchema,
  type VerificationConfig,
} from "./types.js";
import { VerificationService } from "./verification.js";

export { verifyEmailInputSchema, verificationResultSchema } from "./types.js";

export const VERIFY_EMAIL_TOOL = "verify_email";

export function createVerificationService(
  config: VerificationConfig = loadConfig(),
): VerificationService {
  return new VerificationService({
    provider: new MockProviderClient(),
    config,
  });
}

export function createMcpServer(service: VerificationService): McpServer {
  const server = new McpServer({
    name: "inboxvalid-mcp-server",
    version: "0.1.0",
  });

  server.registerTool(
    VERIFY_EMAIL_TOOL,
    {
      description: "Verify an email address and return a structured deliverability result.",
      inputSchema: {
        address: z.string().min(1).describe("Email address to verify"),
      },
      outputSchema: {
        email: z.string().min(1),
        status: verificationStatusSchema,
        reason: z.string().min(1),
      },
    },
    async ({ address }) => {
      try {
        const result = await service.verify(address);
        const validated = verificationResultSchema.parse(result);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(validated, null, 2),
            },
          ],
          structuredContent: validated,
        };
      } catch (error) {
        if (error instanceof ProviderError) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Verification provider error (${error.code}): ${error.message}`,
              },
            ],
          };
        }
        throw error;
      }
    },
  );

  return server;
}

export async function startServer(): Promise<void> {
  const service = createVerificationService();
  const server = createMcpServer(service);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return fileURLToPath(import.meta.url) === path.resolve(entry);
}

async function main(): Promise<void> {
  await startServer();
}

if (isDirectRun()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
