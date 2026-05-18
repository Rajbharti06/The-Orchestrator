---
name: build-pipeline
description: Full 8-phase autonomous build pipeline — Plan → Architect → Build → QA → Fix → Run → Test → Deploy
version: 2.0.0
triggers: [build, generate, create, implement, full-stack, app, application, pipeline]
tags: [build, orchestration, pipeline, autonomous]
---

# Build Pipeline Skill

The Orchestrator X 8-phase autonomous build pipeline. Takes a natural language prompt and produces a complete, deployed application.

## Pipeline Phases

```
[User Prompt]
     │
     ▼
[Strategy]     ← Decompose complex goals into phases with success criteria
     │
     ▼
[Planner]      ← Detect stack (FastAPI/Express/Django + React/Vue/Next.js + PostgreSQL)
     │
     ▼
[Architect]    ← Design file structure, API contracts, DB schema
     │
     ├──────────────────┐
     ▼                  ▼
[Backend]          [Frontend]    ← PARALLEL: generate all code
     │                  │
     └──────────────────┘
               │
               ▼
          [QA Audit]    ← Security + contract validation (score 0-100)
               │
               ├── pass → [Run] → [API Tests] → [Deploy]
               │
               └── fail → [Fix] → [QA Audit]  (max 3x)
                              │
                        [Web Search]  ← Unknown errors
```

## Usage

```bash
# Full pipeline
POST /build
{ "prompt": "Create a FastAPI backend with JWT auth and React frontend", "deploy": false }

# CLI
orchestrator build "Create a task management API with React frontend"

# Mock mode (no API keys)
MOCK=true orchestrator build "Create a REST API"
```

## Key Behaviors

- Backend and UI agents run in **parallel** — saves ~40% time
- Fix loop retries up to **3 times** before escalating
- Web search agent finds solutions for **unknown errors**
- All failures are recorded as **lessons** to prevent recurrence
- Successful patterns become **instincts** for future builds

## Quality Standards

- QA score >= 70 required to proceed
- No critical security issues (OWASP Top 10)
- All API endpoints must be tested
- Environment variables for ALL secrets

## Supported Stacks

| Backend | Frontend | Database | Auth |
|---------|----------|----------|------|
| FastAPI | React | PostgreSQL | JWT |
| Express | Vue | MySQL | OAuth |
| Django | Next.js | SQLite | Session |
| Gin | Svelte | MongoDB | — |
| Spring Boot | — | — | — |
