import { describe, it, expect } from "vitest";
import { MockProviderClient } from "../src/client.js";
import { ProviderError } from "../src/types.js";

describe("MockProviderClient", () => {
  describe("forced scenario option", () => {
    it("returns a valid provider response", async () => {
      const client = new MockProviderClient({ scenario: "valid" });
      const result = await client.verify("user@example.com");
      expect(result).toEqual({
        address: "user@example.com",
        deliverable: true,
        risk_level: "low",
        detail: "Mailbox exists and is deliverable",
      });
    });

    it("returns an invalid provider response", async () => {
      const client = new MockProviderClient({ scenario: "invalid" });
      const result = await client.verify("user@example.com");
      expect(result.deliverable).toBe(false);
      expect(result.risk_level).toBe("low");
    });

    it("returns a risky provider response", async () => {
      const client = new MockProviderClient({ scenario: "risky" });
      const result = await client.verify("user@example.com");
      expect(result.deliverable).toBe(true);
      expect(result.risk_level).toBe("high");
    });

    it("throws retryable SERVER_ERROR", async () => {
      const client = new MockProviderClient({ scenario: "server_error" });
      await expect(client.verify("user@example.com")).rejects.toMatchObject({
        name: "ProviderError",
        code: "SERVER_ERROR",
        retryable: true,
      });
    });

    it("throws retryable RATE_LIMITED", async () => {
      const client = new MockProviderClient({ scenario: "rate_limited" });
      await expect(client.verify("user@example.com")).rejects.toMatchObject({
        code: "RATE_LIMITED",
        retryable: true,
      });
    });

    it("throws retryable TIMEOUT", async () => {
      const client = new MockProviderClient({ scenario: "timeout" });
      await expect(client.verify("user@example.com")).rejects.toMatchObject({
        code: "TIMEOUT",
        retryable: true,
      });
    });

    it("throws non-retryable BAD_REQUEST", async () => {
      const client = new MockProviderClient({ scenario: "bad_request" });
      await expect(client.verify("user@example.com")).rejects.toMatchObject({
        code: "BAD_REQUEST",
        retryable: false,
      });
    });

    it("throws non-retryable MALFORMED_RESPONSE", async () => {
      const client = new MockProviderClient({ scenario: "malformed" });
      await expect(client.verify("user@example.com")).rejects.toMatchObject({
        code: "MALFORMED_RESPONSE",
        retryable: false,
      });
    });
  });

  describe("address-based scenario inference", () => {
    it("defaults to valid for normal addresses", async () => {
      const client = new MockProviderClient();
      const result = await client.verify("user@example.com");
      expect(result.deliverable).toBe(true);
    });

    it("infers scenario from local part when option is not set", async () => {
      const client = new MockProviderClient();
      await expect(client.verify("timeout@example.com")).rejects.toBeInstanceOf(
        ProviderError,
      );
      const invalid = await client.verify("invalid@example.com");
      expect(invalid.deliverable).toBe(false);
    });
  });

  describe("transientFailures", () => {
    it("fails then succeeds for retry testing", async () => {
      const client = new MockProviderClient({
        scenario: "valid",
        transientFailures: 2,
      });

      await expect(client.verify("user@example.com")).rejects.toMatchObject({
        code: "SERVER_ERROR",
        retryable: true,
      });
      await expect(client.verify("user@example.com")).rejects.toMatchObject({
        code: "SERVER_ERROR",
      });

      const result = await client.verify("user@example.com");
      expect(result.deliverable).toBe(true);
      expect(client.callCount).toBe(3);
    });
  });

  describe("latencyMs", () => {
    it("waits before returning", async () => {
      const client = new MockProviderClient({ latencyMs: 50 });
      const start = Date.now();
      await client.verify("user@example.com");
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
  });
});
