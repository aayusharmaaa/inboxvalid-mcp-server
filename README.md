# InboxValid MCP Server

> **Status:** Skeleton only — business logic not yet implemented.

MCP server for [Tvaram / InboxValid.ai](https://inboxvalid.ai) internship assignment (Task 2, Option A).

Exposes a single tool:

```
verify_email({ address: string }) → { email, status, reason }
```

Where `status` is `"valid" | "invalid" | "risky"`.

## Architecture (planned)

```
MCP handler (server.ts)
        │
        ▼
VerificationService (verification.ts)   ← business logic
        │
        ▼
ProviderClient (client.ts)            ← external API boundary
        │
        ▼
Mock InboxValid API
```

## Project structure

```
src/
├── server.ts        # MCP adapter — thin, no business logic
├── verification.ts  # normalize, validate, retry, map results
├── client.ts        # ProviderClient interface + mock implementation
└── types.ts         # domain types and error classes

tests/
├── verification.test.ts
└── server.test.ts
```

## Setup

```bash
npm install
cp .env.example .env
npm run build
npm test
```

## Next steps

Implementation will proceed in this order:

1. Domain types and Zod schemas
2. Local validation (syntax + disposable domains)
3. Mock provider client
4. Verification service + retry logic
5. MCP wiring
6. Tests and demo
