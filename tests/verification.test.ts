import { describe, it, expect, vi, afterEach } from "vitest";
import { VerificationService, withRetry, mapProviderResponse } from "../src/verification.js";
import { MockProviderClient } from "../src/client.js";
import type { VerificationConfig } from "../src/types.js";
import { ProviderError } from "../src/types.js";
import type { ProviderClient } from "../src/client.js";

function createService(
  overrides: Partial<VerificationConfig> = {},
  provider?: ProviderClient,
): VerificationService {
  const defaultProvider: ProviderClient = {
    verify: vi.fn(),
  };

  const config: VerificationConfig = {
    disposableDomains: new Set(["mailinator.com", "tempmail.com"]),
    retry: { maxAttempts: 2, baseDelayMs: 100 },
    provider: { baseUrl: "http://mock", apiKey: "key" },
    ...overrides,
  };

  return new VerificationService({
    provider: provider ?? defaultProvider,
    config,
  });
}

describe("VerificationService.normalize", () => {
  const service = createService();

  it("trims surrounding whitespace", () => {
    expect(service.normalize("  user@example.com  ")).toBe("user@example.com");
  });

  it("lowercases the address", () => {
    expect(service.normalize("User@Example.COM")).toBe("user@example.com");
  });

  it("applies trim and lowercase together", () => {
    expect(service.normalize("  Foo@BAR.com ")).toBe("foo@bar.com");
  });
});

describe("VerificationService.isValidSyntax", () => {
  const service = createService();

  it("accepts common valid addresses", () => {
    expect(service.isValidSyntax("user@example.com")).toBe(true);
    expect(service.isValidSyntax("user.name+tag@mail.co.uk")).toBe(true);
    expect(service.isValidSyntax("a@b.co")).toBe(true);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(service.isValidSyntax("")).toBe(false);
    expect(service.isValidSyntax("   ")).toBe(false);
  });

  it("rejects missing or multiple @ symbols", () => {
    expect(service.isValidSyntax("notanemail")).toBe(false);
    expect(service.isValidSyntax("@example.com")).toBe(false);
    expect(service.isValidSyntax("user@")).toBe(false);
    expect(service.isValidSyntax("user@@example.com")).toBe(false);
    expect(service.isValidSyntax("user@example@com")).toBe(false);
  });

  it("rejects domains without a dot or TLD", () => {
    expect(service.isValidSyntax("user@localhost")).toBe(false);
    expect(service.isValidSyntax("user@example.c")).toBe(false);
  });

  it("rejects dot edge cases in local and domain parts", () => {
    expect(service.isValidSyntax(".user@example.com")).toBe(false);
    expect(service.isValidSyntax("user.@example.com")).toBe(false);
    expect(service.isValidSyntax("user..name@example.com")).toBe(false);
    expect(service.isValidSyntax("user@.example.com")).toBe(false);
    expect(service.isValidSyntax("user@example..com")).toBe(false);
  });

  it("rejects addresses with spaces or invalid characters", () => {
    expect(service.isValidSyntax("user @example.com")).toBe(false);
    expect(service.isValidSyntax("user@exa mple.com")).toBe(false);
    expect(service.isValidSyntax("user!@example.com")).toBe(false);
  });
});

describe("VerificationService.isDisposableDomain", () => {
  it("returns true for configured disposable domains", () => {
    const service = createService();
    expect(service.isDisposableDomain("user@mailinator.com")).toBe(true);
    expect(service.isDisposableDomain("user@tempmail.com")).toBe(true);
  });

  it("returns false for non-disposable domains", () => {
    const service = createService();
    expect(service.isDisposableDomain("user@example.com")).toBe(false);
    expect(service.isDisposableDomain("user@gmail.com")).toBe(false);
  });

  it("uses exact domain match, not substring", () => {
    const service = createService();
    expect(service.isDisposableDomain("user@notmailinator.com")).toBe(false);
    expect(service.isDisposableDomain("user@mailinator.com.evil.com")).toBe(
      false,
    );
  });

  it("returns false when there is no domain part", () => {
    const service = createService();
    expect(service.isDisposableDomain("nodomain")).toBe(false);
    expect(service.isDisposableDomain("@mailinator.com")).toBe(false);
  });

  it("respects a custom disposable domain list from config", () => {
    const service = createService({
      disposableDomains: new Set(["throwaway.test"]),
    });
    expect(service.isDisposableDomain("user@throwaway.test")).toBe(true);
    expect(service.isDisposableDomain("user@mailinator.com")).toBe(false);
  });
});

describe("mapProviderResponse", () => {
  it("maps undeliverable mailboxes to invalid", () => {
    expect(
      mapProviderResponse(
        {
          address: "x@example.com",
          deliverable: false,
          risk_level: "low",
          detail: "Mailbox does not exist",
        },
        "x@example.com",
      ),
    ).toEqual({
      email: "x@example.com",
      status: "invalid",
      reason: "Mailbox does not exist",
    });
  });

  it("maps elevated risk to risky", () => {
    expect(
      mapProviderResponse(
        {
          address: "x@example.com",
          deliverable: true,
          risk_level: "high",
          detail: "Catch-all domain",
        },
        "x@example.com",
      ),
    ).toMatchObject({ status: "risky" });
  });

  it("maps low-risk deliverable mailboxes to valid", () => {
    expect(
      mapProviderResponse(
        {
          address: "x@example.com",
          deliverable: true,
          risk_level: "low",
          detail: "Mailbox exists",
        },
        "x@example.com",
      ),
    ).toMatchObject({ status: "valid" });
  });
});

describe("withRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries transient errors and eventually succeeds", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ProviderError("SERVER_ERROR", "down"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 100 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable provider errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new ProviderError("BAD_REQUEST", "bad input"));

    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 100 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries and rethrows the last error", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValue(new ProviderError("SERVER_ERROR", "still down"));

    const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 100 });
    const expectation = expect(promise).rejects.toMatchObject({
      code: "SERVER_ERROR",
    });
    await vi.runAllTimersAsync();
    await expectation;
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("VerificationService.verify", () => {
  it("rejects malformed emails without calling provider", async () => {
    const provider = { verify: vi.fn() };
    const service = createService({}, provider);

    const result = await service.verify("not-an-email");

    expect(result).toEqual({
      email: "not-an-email",
      status: "invalid",
      reason: "Invalid email address format",
    });
    expect(provider.verify).not.toHaveBeenCalled();
  });

  it("flags disposable domains as risky without provider call", async () => {
    const provider = { verify: vi.fn() };
    const service = createService({}, provider);

    const result = await service.verify("user@mailinator.com");

    expect(result).toMatchObject({
      email: "user@mailinator.com",
      status: "risky",
      reason: "Disposable email domain",
    });
    expect(provider.verify).not.toHaveBeenCalled();
  });

  it("maps provider valid response to VerificationResult", async () => {
    const provider = new MockProviderClient({ scenario: "valid" });
    const service = createService({}, provider);

    const result = await service.verify("user@example.com");

    expect(result).toMatchObject({
      email: "user@example.com",
      status: "valid",
    });
  });

  it("maps provider invalid response to VerificationResult", async () => {
    const provider = new MockProviderClient({ scenario: "invalid" });
    const service = createService({}, provider);

    const result = await service.verify("user@example.com");

    expect(result).toMatchObject({
      status: "invalid",
      reason: "Mailbox does not exist",
    });
  });

  it("maps provider risky response to VerificationResult", async () => {
    const provider = new MockProviderClient({ scenario: "risky" });
    const service = createService({}, provider);

    const result = await service.verify("user@example.com");

    expect(result).toMatchObject({
      status: "risky",
      reason: "Disposable or high-risk mailbox",
    });
  });

  it("retries transient 5xx errors and succeeds", async () => {
    vi.useFakeTimers();
    const provider = new MockProviderClient({
      scenario: "valid",
      transientFailures: 1,
    });
    const service = createService({ retry: { maxAttempts: 2, baseDelayMs: 50 } }, provider);

    const promise = service.verify("user@example.com");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("valid");
    expect(provider.callCount).toBe(2);
  });

  it("retries 429 errors with backoff", async () => {
    vi.useFakeTimers();
    const provider = new MockProviderClient({ scenario: "rate_limited" });
    const fn = vi.spyOn(provider, "verify");
    fn.mockRejectedValueOnce(new ProviderError("RATE_LIMITED", "slow down"));
    fn.mockResolvedValueOnce({
      address: "user@example.com",
      deliverable: true,
      risk_level: "low",
      detail: "Mailbox exists and is deliverable",
    });

    const service = createService({ retry: { maxAttempts: 1, baseDelayMs: 100 } }, provider);
    const promise = service.verify("user@example.com");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("valid");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry 400 errors", async () => {
    const provider = new MockProviderClient({ scenario: "bad_request" });
    const service = createService({}, provider);

    await expect(service.verify("user@example.com")).rejects.toMatchObject({
      code: "BAD_REQUEST",
      retryable: false,
    });
    expect(provider.callCount).toBe(1);
  });

  it("exhausts retries on persistent failures", async () => {
    vi.useFakeTimers();
    const provider = new MockProviderClient({ scenario: "server_error" });
    const service = createService({ retry: { maxAttempts: 2, baseDelayMs: 10 } }, provider);

    const promise = service.verify("user@example.com");
    const expectation = expect(promise).rejects.toMatchObject({
      code: "SERVER_ERROR",
    });
    await vi.runAllTimersAsync();
    await expectation;
    expect(provider.callCount).toBe(3);
  });
});
