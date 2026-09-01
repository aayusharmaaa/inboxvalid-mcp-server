import { describe, it, expect } from "vitest";

describe("VerificationService", () => {
  it.todo("normalizes whitespace and casing");
  it.todo("rejects malformed emails without calling provider");
  it.todo("flags disposable domains as risky without provider call");
  it.todo("maps provider valid response to VerificationResult");
  it.todo("maps provider invalid response to VerificationResult");
  it.todo("maps provider risky response to VerificationResult");
  it.todo("retries transient 5xx errors and succeeds");
  it.todo("retries 429 errors with backoff");
  it.todo("does not retry 400/422 errors");
  it.todo("exhausts retries on persistent failures");
});
