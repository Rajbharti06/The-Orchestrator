---
name: build
description: Start the full autonomous build pipeline
---

# /build

Start the Orchestrator X 8-phase autonomous build pipeline.

## Usage

```
/build [prompt]
```

## What Happens

1. **Strategy** — Decomposes complex goals into phases
2. **Planning** — Detects stack (FastAPI, Express, React, Vue, etc.)
3. **Architecture** — Designs file structure, API contracts, DB schema
4. **Code Generation** — Backend + Frontend generated in parallel
5. **QA Audit** — Security scan + contract validation (score 0-100)
6. **Fix Loop** — Resolves all issues (max 3 attempts)
7. **Run** — Boots and verifies application startup
8. **API Tests** — Makes real HTTP calls to all endpoints

## Examples

```
/build Create a FastAPI backend with JWT authentication and a React frontend

/build Build a multi-tenant SaaS app with organizations, users, subscriptions, and Stripe payment integration

/build Create a real-time chat application with WebSocket support and PostgreSQL message persistence
```

## Options

- Add "deploy to railway" to auto-deploy after build
- Add "mock" to run without API keys (MOCK=true)
- Complexity is auto-detected — simple prompts skip strategy decomposition

## Output

- All generated source files in context
- QA report with score and any remaining issues
- API test results (pass rate %)
- Deployment config (if deploy requested)
- Lessons learned stored for future builds
