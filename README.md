# InboxValid MCP Server

MCP server that exposes `verify_email` for email deliverability checks. Built for the Tvaram internship assignment (Task 2, Option A).

The InboxValid API is mocked. The focus is a typed tool interface that agents can call reliably.

## Quick start

```bash
npm install
cp .env.example .env   # optional
npm test
npm run demo
npm run build
npm start
```

Requires Node 18+.

## Tool contract

**Input**

```json
{ "address": "user@example.com" }
```

**Output**

```json
{
  "email": "user@example.com",
  "status": "valid",
  "reason": "Mailbox exists and is deliverable"
}
```

`status` is `valid`, `invalid`, or `risky`.

## Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│  MCP client (Cursor, Claude Desktop, demo script, etc.)     │
└─────────────────────────────┬───────────────────────────────┘
                              │ verify_email({ address })
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  server.ts — MCP adapter                                    │
│  • Zod input/output validation                              │
│  • delegates to VerificationService                           │
│  • maps ProviderError → MCP tool error                      │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  verification.ts — business logic                           │
│  • normalize → syntax check → disposable check              │
│  • provider call (with retry) → map result                  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  client.ts — provider boundary                              │
│  • ProviderClient interface                                   │
│  • MockProviderClient (assignment)                          │
│  • InboxValidClient stub (production swap-in)               │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
                    Mock InboxValid API

types.ts — shared schemas, errors, config (used by all layers)
```

### Request flow

```
address
  │
  ├─ normalize (trim, lowercase)
  │
  ├─ syntax invalid? ──────────────────► { status: "invalid" }
  │
  ├─ disposable domain? ───────────────► { status: "risky" }
  │
  ├─ provider.verify() with retry
  │     │
  │     ├─ deliverable: false ─────────► { status: "invalid" }
  │     ├─ risk_level: medium/high ────► { status: "risky" }
  │     └─ deliverable + low risk ─────► { status: "valid" }
  │
  └─ provider failure (after retries) ─► MCP tool error
```

### Layers

| File | Role |
|------|------|
| `server.ts` | MCP transport and tool registration. No verification rules. |
| `verification.ts` | Pipeline orchestration, local checks, retry, result mapping. |
| `client.ts` | External API abstraction. Mock today; real HTTP client later. |
| `types.ts` | Zod schemas, `ProviderError`, env config. |

MCP is one adapter. The same `VerificationService` could back a REST endpoint without changing core logic.

### Error boundaries

| Layer | Handles |
|-------|---------|
| MCP (`server.ts`) | Bad tool input shape, unexpected handler failures |
| Service (`verification.ts`) | Syntax/disposable short-circuit, response mapping |
| Retry (`withRetry`) | Transient provider errors only |
| Client (`client.ts`) | HTTP transport, provider-specific failures |

Email problems return a normal `VerificationResult`. API failures throw `ProviderError`.

### Retry policy

| Error | Retries |
|-------|---------|
| 429, 5xx, timeout, network | Yes |
| 400, malformed response | No |

Backoff: `baseDelayMs × 2^attempt`. Default config allows 3 total attempts.

```
RETRY_MAX_ATTEMPTS=2
RETRY_BASE_DELAY_MS=100
DISPOSABLE_DOMAINS=mailinator.com,tempmail.com
```

## Demo

```bash
npm run demo
```

Runs `verify_email` in-process for: valid email, bad syntax, disposable domain, and a transient failure that succeeds on retry.

### Cursor MCP config

```json
{
  "mcpServers": {
    "inboxvalid": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "/path/to/tvaram"
    }
  }
}
```

Dev mode (no build):

```json
{
  "mcpServers": {
    "inboxvalid": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "/path/to/tvaram"
    }
  }
}
```

### Mock provider scenarios

Force in tests:

```typescript
new MockProviderClient({ scenario: "timeout" })
```

Or use the local part of the address: `invalid@…`, `risky@…`, `timeout@…`, `ratelimit@…`, `servererror@…`.

## Project layout

```
src/
  server.ts
  verification.ts
  client.ts
  types.ts
tests/
scripts/demo.ts
```

## Assumptions

- Mock backend is sufficient for the assignment brief.
- Three statuses are enough for agent decision-making.
- Disposable domains are checked locally before calling the provider.
- stdio MCP transport is enough for local use and demos.

## Production next steps

- Implement `InboxValidClient` with real HTTP, auth, and timeouts.
- Add logging and metrics on retry attempts.
- Expand disposable-domain detection.
- Short-TTL cache for repeat lookups.

## Tests

```bash
npm test
```

65 tests covering types, validation, provider scenarios, retry behaviour, and MCP tool calls via in-memory transport.
