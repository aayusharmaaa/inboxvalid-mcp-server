import {
  ProviderError,
  type ProviderResponse,
  type ProviderRiskLevel,
} from "./types.js";

export type { ProviderResponse, ProviderRiskLevel };

// Swap this interface for a real HTTP client without touching verification.ts.
export interface ProviderClient {
  verify(address: string): Promise<ProviderResponse>;
}

export interface MockProviderOptions {
  latencyMs?: number;
  scenario?: MockScenario;
  transientFailures?: number; // throw N times before succeeding (for retry tests)
}

export type MockScenario =
  | "valid"
  | "invalid"
  | "risky"
  | "server_error"
  | "rate_limited"
  | "timeout"
  | "malformed"
  | "bad_request";

// Quick way to demo different outcomes without passing options every time.
// e.g. invalid@example.com, timeout@example.com, ratelimit@example.com
const ADDRESS_SCENARIO_MAP: Readonly<Record<string, MockScenario>> = {
  invalid: "invalid",
  risky: "risky",
  timeout: "timeout",
  ratelimit: "rate_limited",
  servererror: "server_error",
  badrequest: "bad_request",
  malformed: "malformed",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function localPart(address: string): string {
  const at = address.indexOf("@");
  return (at > 0 ? address.slice(0, at) : address).toLowerCase();
}

export class MockProviderClient implements ProviderClient {
  private transientFailuresRemaining: number;
  private _callCount = 0;

  constructor(private readonly options: MockProviderOptions = {}) {
    this.transientFailuresRemaining = options.transientFailures ?? 0;
  }

  get callCount(): number {
    return this._callCount;
  }

  async verify(address: string): Promise<ProviderResponse> {
    this._callCount++;

    if (this.options.latencyMs && this.options.latencyMs > 0) {
      await sleep(this.options.latencyMs);
    }

    if (this.transientFailuresRemaining > 0) {
      this.transientFailuresRemaining--;
      throw new ProviderError(
        "SERVER_ERROR",
        "Simulated transient server error",
      );
    }

    const scenario = this.resolveScenario(address);
    return this.executeScenario(address, scenario);
  }

  private resolveScenario(address: string): MockScenario {
    if (this.options.scenario) {
      return this.options.scenario;
    }
    return ADDRESS_SCENARIO_MAP[localPart(address)] ?? "valid";
  }

  private executeScenario(
    address: string,
    scenario: MockScenario,
  ): ProviderResponse {
    switch (scenario) {
      case "valid":
        return successResponse(address, {
          deliverable: true,
          risk_level: "low",
          detail: "Mailbox exists and is deliverable",
        });
      case "invalid":
        return successResponse(address, {
          deliverable: false,
          risk_level: "low",
          detail: "Mailbox does not exist",
        });
      case "risky":
        return successResponse(address, {
          deliverable: true,
          risk_level: "high",
          detail: "Disposable or high-risk mailbox",
        });
      case "server_error":
        throw new ProviderError("SERVER_ERROR", "Simulated internal server error");
      case "rate_limited":
        throw new ProviderError("RATE_LIMITED", "Simulated rate limit exceeded");
      case "timeout":
        throw new ProviderError("TIMEOUT", "Simulated request timeout");
      case "bad_request":
        throw new ProviderError("BAD_REQUEST", "Simulated bad request");
      case "malformed":
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          "Simulated malformed provider response",
        );
      default: {
        const _exhaustive: never = scenario;
        return _exhaustive;
      }
    }
  }
}

function successResponse(
  address: string,
  fields: Pick<ProviderResponse, "deliverable" | "risk_level" | "detail">,
): ProviderResponse {
  return {
    address,
    ...fields,
  };
}

// Placeholder for a real InboxValid HTTP client.
export class InboxValidClient implements ProviderClient {
  constructor(_baseUrl: string, _apiKey: string) {}

  async verify(_address: string): Promise<ProviderResponse> {
    throw new Error("InboxValidClient.verify not implemented");
  }
}
