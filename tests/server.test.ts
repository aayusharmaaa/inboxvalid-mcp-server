import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockProviderClient } from "../src/client.js";
import {
  createMcpServer,
  createVerificationService,
  VERIFY_EMAIL_TOOL,
} from "../src/server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { VerificationService } from "../src/verification.js";

async function connectTestClient(
  service: VerificationService,
): Promise<{ client: McpClient; server: McpServer }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(service);
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);

  return { client, server };
}

function createTestService(): VerificationService {
  return new VerificationService({
    provider: new MockProviderClient(),
    config: {
      disposableDomains: new Set(["mailinator.com"]),
      retry: { maxAttempts: 2, baseDelayMs: 10 },
      provider: { baseUrl: "http://mock", apiKey: "key" },
    },
  });
}

describe("MCP server", () => {
  let client: McpClient;
  let server: McpServer;

  beforeEach(async () => {
    ({ client, server } = await connectTestClient(createTestService()));
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("registers verify_email tool with correct input schema", async () => {
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === VERIFY_EMAIL_TOOL);

    expect(tool).toBeDefined();
    expect(tool?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        address: expect.objectContaining({ type: "string" }),
      },
      required: ["address"],
    });
  });

  it("returns structured VerificationResult for valid input", async () => {
    const result = await client.callTool({
      name: VERIFY_EMAIL_TOOL,
      arguments: { address: "user@example.com" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      email: "user@example.com",
      status: "valid",
      reason: expect.any(String),
    });
  });

  it("returns invalid status for malformed addresses", async () => {
    const result = await client.callTool({
      name: VERIFY_EMAIL_TOOL,
      arguments: { address: "not-an-email" },
    });

    expect(result.structuredContent).toMatchObject({
      email: "not-an-email",
      status: "invalid",
    });
  });

  it("returns risky status for disposable domains", async () => {
    const result = await client.callTool({
      name: VERIFY_EMAIL_TOOL,
      arguments: { address: "user@mailinator.com" },
    });

    expect(result.structuredContent).toMatchObject({
      email: "user@mailinator.com",
      status: "risky",
      reason: "Disposable email domain",
    });
  });

  it("rejects missing address", async () => {
    const result = await client.callTool({
      name: VERIFY_EMAIL_TOOL,
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });

  it("rejects non-string address", async () => {
    const result = await client.callTool({
      name: VERIFY_EMAIL_TOOL,
      arguments: { address: 123 },
    });

    expect(result.isError).toBe(true);
  });
});

describe("createVerificationService", () => {
  it("wires mock provider and config defaults", () => {
    const service = createVerificationService();
    expect(service).toBeInstanceOf(VerificationService);
  });
});
