/**
 * Domain types for email verification.
 * Implementation and Zod schemas will be added in a later step.
 */

export type VerificationStatus = "valid" | "invalid" | "risky";

export interface VerificationResult {
  email: string;
  status: VerificationStatus;
  reason: string;
}

export interface VerifyEmailInput {
  address: string;
}

/** Raw response shape from the InboxValid (mock) provider API. */
export interface ProviderResponse {
  address: string;
  deliverable: boolean;
  risk_level: "low" | "medium" | "high";
  detail: string;
}

/** Errors thrown by the provider client layer. */
export type ProviderErrorCode =
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "NETWORK"
  | "MALFORMED_RESPONSE";

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
}

export interface VerificationConfig {
  disposableDomains: Set<string>;
  retry: RetryConfig;
}
