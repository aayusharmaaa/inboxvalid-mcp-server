import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockProviderClient } from "../src/client.js";
import { loadConfig } from "../src/types.js";
import {
  createMcpServer,
  createVerificationService,
  VERIFY_EMAIL_TOOL,
} from "../src/server.js";
import { VerificationService } from "../src/verification.js";

async function callVerifyEmail(
  address: string,
  service = createVerificationService(),
) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(service);
  await server.connect(serverTransport);

  const client = new Client({ name: "demo-client", version: "1.0.0" });
  await client.connect(clientTransport);

  const result = await client.callTool({
    name: VERIFY_EMAIL_TOOL,
    arguments: { address },
  });

  await client.close();
  await server.close();

  return result;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const retryService = new VerificationService({
    provider: new MockProviderClient({ scenario: "valid", transientFailures: 1 }),
    config,
  });

  const scenarios = [
    { label: "valid email", address: "user@example.com" },
    { label: "invalid syntax", address: "not-an-email" },
    { label: "disposable domain", address: "user@mailinator.com" },
    {
      label: "transient failure + retry",
      address: "user@example.com",
      service: retryService,
    },
  ];

  console.log("InboxValid MCP demo — verify_email tool\n");

  for (const { label, address, service } of scenarios) {
    const result = await callVerifyEmail(address, service);
    console.log(`--- ${label} ---`);
    console.log(`Input: ${address}`);
    console.log(JSON.stringify(result.structuredContent ?? result.content, null, 2));
    console.log();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
