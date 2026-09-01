import type { ProviderClient } from "./client.js";
import {
  ProviderError,
  providerResponseSchema,
  type ProviderResponse,
  type VerificationConfig,
  type VerificationResult,
} from "./types.js";

export interface VerificationServiceDeps {
  provider: ProviderClient;
  config: VerificationConfig;
}

const PRACTICAL_EMAIL_PATTERN =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableProviderError(error: unknown): boolean {
  return error instanceof ProviderError && error.retryable;
}

export class VerificationService {
  constructor(private readonly deps: VerificationServiceDeps) {}

  async verify(address: string): Promise<VerificationResult> {
    const email = this.normalize(address);

    if (!this.isValidSyntax(email)) {
      return {
        email,
        status: "invalid",
        reason: "Invalid email address format",
      };
    }

    if (this.isDisposableDomain(email)) {
      return {
        email,
        status: "risky",
        reason: "Disposable email domain",
      };
    }

    const raw = await withRetry(
      () => this.deps.provider.verify(email),
      this.deps.config.retry,
    );

    const parsed = providerResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ProviderError(
        "MALFORMED_RESPONSE",
        "Provider returned an invalid response shape",
      );
    }

    return mapProviderResponse(parsed.data, email);
  }

  normalize(address: string): string {
    return address.trim().toLowerCase();
  }

  isValidSyntax(email: string): boolean {
    if (email.length < 3 || email.length > 254) {
      return false;
    }

    if (email.includes("..")) {
      return false;
    }

    const atIndex = email.indexOf("@");
    if (
      atIndex <= 0 ||
      atIndex !== email.lastIndexOf("@") ||
      atIndex === email.length - 1
    ) {
      return false;
    }

    const local = email.slice(0, atIndex);
    const domain = email.slice(atIndex + 1);

    if (local.startsWith(".") || local.endsWith(".")) {
      return false;
    }
    if (domain.startsWith(".") || domain.endsWith(".")) {
      return false;
    }

    const tld = domain.split(".").pop();
    if (!tld || tld.length < 2) {
      return false;
    }

    return PRACTICAL_EMAIL_PATTERN.test(email);
  }

  isDisposableDomain(email: string): boolean {
    const atIndex = email.lastIndexOf("@");
    if (atIndex <= 0 || atIndex === email.length - 1) {
      return false;
    }

    const domain = email.slice(atIndex + 1);
    return this.deps.config.disposableDomains.has(domain);
  }
}

export function mapProviderResponse(
  response: ProviderResponse,
  email: string,
): VerificationResult {
  if (!response.deliverable) {
    return {
      email,
      status: "invalid",
      reason: response.detail || "Mailbox is not deliverable",
    };
  }

  if (response.risk_level === "medium" || response.risk_level === "high") {
    return {
      email,
      status: "risky",
      reason: response.detail || "Elevated deliverability risk",
    };
  }

  return {
    email,
    status: "valid",
    reason: response.detail || "Mailbox exists and is deliverable",
  };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: VerificationConfig["retry"],
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === config.maxAttempts;
      if (isLastAttempt || !isRetryableProviderError(error)) {
        throw error;
      }

      const delayMs = config.baseDelayMs * 2 ** attempt;
      await sleep(delayMs);
    }
  }

  throw lastError;
}
