import type { ProviderClient } from "./client.js";
import type {
  VerificationConfig,
  VerificationResult,
} from "./types.js";

export interface VerificationServiceDeps {
  provider: ProviderClient;
  config: VerificationConfig;
}

/**
 * Core business logic: normalize → local validation → provider call → map result.
 * MCP and other adapters call this service; they do not contain verification rules.
 */
export class VerificationService {
  constructor(private readonly deps: VerificationServiceDeps) {}

  async verify(address: string): Promise<VerificationResult> {
    throw new Error("VerificationService.verify not implemented");
  }

  /** Trim and lowercase the address. */
  normalize(address: string): string {
    throw new Error("VerificationService.normalize not implemented");
  }

  /** Practical syntax check — not full RFC parsing. */
  isValidSyntax(email: string): boolean {
    throw new Error("VerificationService.isValidSyntax not implemented");
  }

  /** Check against configured disposable domain list. */
  isDisposableDomain(email: string): boolean {
    throw new Error("VerificationService.isDisposableDomain not implemented");
  }
}

/**
 * Call provider with bounded exponential backoff for transient failures only.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: VerificationConfig["retry"],
): Promise<T> {
  throw new Error("withRetry not implemented");
}
