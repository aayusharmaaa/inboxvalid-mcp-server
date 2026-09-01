import { describe, it, expect } from "vitest";
import {
  verifyEmailInputSchema,
  verificationResultSchema,
  providerResponseSchema,
  ProviderError,
  isRetryableErrorCode,
  loadConfig,
} from "../src/types.js";

describe("verifyEmailInputSchema", () => {
  it("accepts a non-empty address string", () => {
    const result = verifyEmailInputSchema.safeParse({
      address: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing address", () => {
    const result = verifyEmailInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty address", () => {
    const result = verifyEmailInputSchema.safeParse({ address: "" });
    expect(result.success).toBe(false);
  });

  it("rejects non-string address", () => {
    const result = verifyEmailInputSchema.safeParse({ address: 123 });
    expect(result.success).toBe(false);
  });
});

describe("verificationResultSchema", () => {
  it("accepts valid, invalid, and risky statuses", () => {
    for (const status of ["valid", "invalid", "risky"] as const) {
      const result = verificationResultSchema.safeParse({
        email: "user@example.com",
        status,
        reason: "test reason",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown status values", () => {
    const result = verificationResultSchema.safeParse({
      email: "user@example.com",
      status: "unknown",
      reason: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty reason", () => {
    const result = verificationResultSchema.safeParse({
      email: "user@example.com",
      status: "valid",
      reason: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed email in result", () => {
    const result = verificationResultSchema.safeParse({
      email: "not-an-email",
      status: "invalid",
      reason: "Invalid email address format",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty email in result", () => {
    const result = verificationResultSchema.safeParse({
      email: "",
      status: "invalid",
      reason: "Invalid email address format",
    });
    expect(result.success).toBe(false);
  });
});

describe("providerResponseSchema", () => {
  it("parses a well-formed provider payload", () => {
    const result = providerResponseSchema.safeParse({
      address: "user@example.com",
      deliverable: true,
      risk_level: "low",
      detail: "Mailbox exists",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid risk_level", () => {
    const result = providerResponseSchema.safeParse({
      address: "user@example.com",
      deliverable: true,
      risk_level: "critical",
      detail: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("ProviderError", () => {
  it("marks transient codes as retryable", () => {
    expect(isRetryableErrorCode("RATE_LIMITED")).toBe(true);
    expect(isRetryableErrorCode("SERVER_ERROR")).toBe(true);
    expect(isRetryableErrorCode("TIMEOUT")).toBe(true);
    expect(isRetryableErrorCode("NETWORK")).toBe(true);
  });

  it("marks client errors as non-retryable", () => {
    expect(isRetryableErrorCode("BAD_REQUEST")).toBe(false);
    expect(isRetryableErrorCode("MALFORMED_RESPONSE")).toBe(false);
  });

  it("sets retryable flag from code", () => {
    const retryable = new ProviderError("SERVER_ERROR", "down");
    const permanent = new ProviderError("BAD_REQUEST", "bad input");
    expect(retryable.retryable).toBe(true);
    expect(permanent.retryable).toBe(false);
  });
});

describe("loadConfig", () => {
  it("applies defaults when env vars are missing", () => {
    const config = loadConfig({});
    expect(config.retry.maxAttempts).toBe(2);
    expect(config.retry.baseDelayMs).toBe(100);
    expect(config.disposableDomains.has("mailinator.com")).toBe(true);
    expect(config.provider.apiKey).toBe("mock-key");
  });

  it("parses custom disposable domains from env", () => {
    const config = loadConfig({
      DISPOSABLE_DOMAINS: "throwaway.test, FAKE.COM ,",
    });
    expect(config.disposableDomains.has("throwaway.test")).toBe(true);
    expect(config.disposableDomains.has("fake.com")).toBe(true);
    expect(config.disposableDomains.size).toBe(2);
  });

  it("parses retry settings from env", () => {
    const config = loadConfig({
      RETRY_MAX_ATTEMPTS: "3",
      RETRY_BASE_DELAY_MS: "250",
    });
    expect(config.retry).toEqual({ maxAttempts: 3, baseDelayMs: 250 });
  });
});
