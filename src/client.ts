import type { ProviderResponse } from "./types.js";

/**
 * Abstraction over an external email verification API (InboxValid).
 * Allows swapping mock ↔ real provider without touching business logic.
 */
export interface ProviderClient {
  verify(address: string): Promise<ProviderResponse>;
}

export interface MockProviderOptions {
  /** Simulated network latency in milliseconds. */
  latencyMs?: number;
  /** Force a specific scenario for deterministic tests. */
  scenario?: MockScenario;
}

export type MockScenario =
  | "valid"
  | "invalid"
  | "risky"
  | "server_error"
  | "rate_limited"
  | "timeout"
  | "malformed";

/**
 * Mock InboxValid API client.
 * Will simulate valid/invalid/risky responses and transient failures.
 */
export class MockProviderClient implements ProviderClient {
  constructor(private readonly options: MockProviderOptions = {}) {}

  async verify(_address: string): Promise<ProviderResponse> {
    throw new Error("MockProviderClient.verify not implemented");
  }
}

/**
 * Real HTTP client for InboxValid API (not implemented — mock is sufficient for assignment).
 */
export class InboxValidClient implements ProviderClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async verify(_address: string): Promise<ProviderResponse> {
    throw new Error("InboxValidClient.verify not implemented");
  }
}
