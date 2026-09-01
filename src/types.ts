import { z } from "zod";

export const verificationStatusSchema = z.enum(["valid", "invalid", "risky"]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const verificationResultSchema = z.object({
  email: z.string().min(1),
  status: verificationStatusSchema,
  reason: z.string().min(1),
});
export type VerificationResult = z.infer<typeof verificationResultSchema>;

export const verifyEmailInputSchema = z.object({
  address: z.string().min(1, "address is required"),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;

export const providerRiskLevelSchema = z.enum(["low", "medium", "high"]);
export type ProviderRiskLevel = z.infer<typeof providerRiskLevelSchema>;

export const providerResponseSchema = z.object({
  address: z.string(),
  deliverable: z.boolean(),
  risk_level: providerRiskLevelSchema,
  detail: z.string(),
});
export type ProviderResponse = z.infer<typeof providerResponseSchema>;

export const providerErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "RATE_LIMITED",
  "SERVER_ERROR",
  "TIMEOUT",
  "NETWORK",
  "MALFORMED_RESPONSE",
]);
export type ProviderErrorCode = z.infer<typeof providerErrorCodeSchema>;

const RETRYABLE_CODES: ReadonlySet<ProviderErrorCode> = new Set([
  "RATE_LIMITED",
  "SERVER_ERROR",
  "TIMEOUT",
  "NETWORK",
]);

export function isRetryableErrorCode(code: ProviderErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = isRetryableErrorCode(code);
  }
}

export const retryConfigSchema = z.object({
  maxAttempts: z.number().int().min(0).max(10),
  baseDelayMs: z.number().int().min(0),
});
export type RetryConfig = z.infer<typeof retryConfigSchema>;

export interface VerificationConfig {
  disposableDomains: ReadonlySet<string>;
  retry: RetryConfig;
  provider: {
    baseUrl: string;
    apiKey: string;
  };
}

const DEFAULT_DISPOSABLE_DOMAINS = [
  "mailinator.com",
  "tempmail.com",
  "guerrillamail.com",
] as const;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseDisposableDomains(value: string | undefined): ReadonlySet<string> {
  const raw = value?.trim() || DEFAULT_DISPOSABLE_DOMAINS.join(",");
  const domains = raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
  return new Set(domains);
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): VerificationConfig {
  const retry = retryConfigSchema.parse({
    maxAttempts: parsePositiveInt(env.RETRY_MAX_ATTEMPTS, 2),
    baseDelayMs: parsePositiveInt(env.RETRY_BASE_DELAY_MS, 100),
  });

  return {
    disposableDomains: parseDisposableDomains(env.DISPOSABLE_DOMAINS),
    retry,
    provider: {
      baseUrl: env.INBOXVALID_API_URL?.trim() || "http://localhost:0/mock",
      apiKey: env.INBOXVALID_API_KEY?.trim() || "mock-key",
    },
  };
}
