# AGENTS.md - Orchestrator X Agent System

This file works across Claude Code, Cursor, Codex, OpenCode, and any AGENTS.md-compatible harness.

## System Overview

Orchestrator X uses 20 specialized pipeline agents + 9 GodMode review agents (29 total). Agents communicate through structured JSON context. The orchestrator coordinates parallel, sequential, and loop-based execution with a dependency graph.

```
[User Prompt]
     │
     ▼
[Researcher] ──── (optional, 30s timeout) technology evaluation
     │
     ▼
[Planner Agent] ──── detects stack, creates phases
     │
     ▼
[Architect Agent] ── designs file structure, API contracts, DB schemas
     │
     ├─────────────── API change? → [API Guardian] ────────────┐
     │                                                          │
     ├────────────────────┐                                     │
     ▼                    ▼                                     │
[Backend Agent]     [UI Agent]        ← Parallel              │
     │                    │                                     │
     └────────────────────┘◄─────────────────────────────────┘
                │
                ▼
          [QA Auditor] ────── OWASP + contract + type validation
                │
                ├──────────────────────────────────────────────┐
                ▼                                              ▼
          [Validator] ────── types + tests + coverage     [Tester] ── E2E + screenshots + perf
                │                                              │
                └──────────────────┬───────────────────────────┘
                                   │
                        Both APPROVED? → [Scribe] → [Run Agent] → [API Tester] → [Deploy]
                        Either BLOCKED? → [Fix Agent] → loop back (max 3x)
                                   │
                             [Web Search] ── on unknown errors
```

## GodMode Workflow (Full Power Mode)

Activate with `/orchestrator:godmode` or by saying "GodMode: [task]":

```
New Feature:   Researcher → Architect → Builder → Validator+Tester (parallel) → Scribe
Bug Fix:       Builder → Validator+Tester (parallel)
API Change:    Researcher → Architect → API-Guardian → Builder → Validator+Tester → Scribe
Refactoring:   Architect → Builder → Validator+Tester (parallel)
Release:       Scribe → GitHub-Manager
```

## Agent Definitions

### 1. Planner Agent
**File**: `agents/plannerAgent.js` | **Definition**: `agents/planner.md`
**Model**: claude-opus-4-5 (complex reasoning required)
**Tools**: read_file, web_search

**Purpose**: Analyzes user prompt, detects technology stack, creates a phased build plan with dependency graph. Output is a structured JSON plan consumed by all downstream agents.

**When to use**: Always the first agent in any build pipeline. Use directly when you need a plan without code generation.

**Output format**:
```json
{
  "stack": { "backend": "fastapi", "frontend": "react", "db": "postgresql" },
  "phases": [
    { "id": "plan", "agent": "planner", "deps": [] },
    { "id": "arch", "agent": "architect", "deps": ["plan"] },
    { "id": "backend", "agent": "backend", "deps": ["arch"], "parallel": true },
    { "id": "ui", "agent": "ui", "deps": ["arch"], "parallel": true },
    { "id": "qa", "agent": "qa", "deps": ["backend", "ui"] }
  ],
  "complexity": "medium",
  "estimatedMinutes": 15
}
```

### 2. Architect Agent
**File**: `agents/architectAgent.js` | **Definition**: `agents/architect.md`
**Model**: claude-opus-4-5
**Tools**: read_file, write_file

**Purpose**: Designs the complete file structure, API endpoint contracts, database schemas, auth strategy, and security rules. Creates the blueprint all other agents follow.

**When to use**: After planning, before code generation. Use directly to get architecture recommendations.

**Output**: Directory tree, OpenAPI-style endpoint specs, DB schema DDL, environment variable list.

### 3. Backend Agent
**File**: `agents/backendAgent.js` | **Definition**: `agents/backend.md`
**Model**: claude-sonnet-4-5
**Tools**: write_file, read_file, bash

**Purpose**: Generates complete backend code following the architect's specifications. Supports FastAPI (Python), Express.js (Node), Django, Gin (Go), Spring Boot (Java).

**When to use**: After architecture is defined. Runs in parallel with UI Agent.

**Output**: Complete source files written to the output directory.

### 4. UI Agent
**File**: `agents/uiAgent.js` | **Definition**: `agents/frontend.md`
**Model**: claude-sonnet-4-5
**Tools**: write_file, read_file

**Purpose**: Generates React/Vue/Next.js frontend components that call the exact API endpoints defined by the architect. Never uses placeholder API URLs.

**When to use**: After architecture. Runs in parallel with Backend Agent.

### 5. QA Auditor Agent
**File**: `agents/qaAgent.js` | **Definition**: `agents/qa-auditor.md`
**Model**: claude-sonnet-4-5
**Tools**: read_file, bash

**Purpose**: Validates generated code against: security rules, API contract compliance, import validity, TypeScript types, test coverage requirements.

**When to use**: After backend and UI generation. Re-runs after each fix attempt.

**Output**: JSON report with pass/fail per check, specific file/line issues.

### 6. Fix Agent
**File**: `agents/fixAgent.js` | **Definition**: `agents/fix-agent.md`
**Model**: claude-sonnet-4-5
**Tools**: read_file, write_file, bash

**Purpose**: Targeted repair of specific issues identified by QA. Fixes only what's broken without regenerating entire files. Uses lessonStore to avoid repeating known mistakes.

**When to use**: When QA audit fails. Max 3 iterations before escalating.

### 7. Run Agent
**File**: `agents/runAgent.js` | **Definition**: `agents/run-agent.md`
**Model**: claude-haiku-3-5 (fast)
**Tools**: bash, read_file

**Purpose**: Boots the generated application, monitors startup logs for errors, determines if the app is listening on the expected port.

**When to use**: After QA passes. Before API testing.

### 8. API Tester Agent
**File**: `agents/apiTesterAgent.js` | **Definition**: `agents/api-tester.md`
**Model**: claude-haiku-3-5
**Tools**: bash, web_fetch

**Purpose**: Makes real HTTP requests to every endpoint defined in the API contract. Reports pass/fail per endpoint with status codes, response validation, and latency.

**When to use**: After the app is confirmed running.

### 9. Deploy Agent (Hosting Router)
**File**: `agents/hostingRouter.js` | **Definition**: `agents/deploy-agent.md`
**Model**: claude-haiku-3-5
**Tools**: bash, read_file, write_file

**Purpose**: Deploys to Vercel, Railway, Render, or Fly.io based on stack and config. Writes deployment config files (vercel.json, railway.toml, etc.) and runs deploy commands.

**When to use**: After API tests pass.

### 10. GitHub Agent
**File**: `agents/githubAgent.js` | **Definition**: `agents/deploy-agent.md`
**Model**: claude-haiku-3-5
**Tools**: bash

**Purpose**: Commits generated code to GitHub. Creates .gitignore, writes meaningful commit messages, handles branch creation.

**When to use**: Before or during deployment.

### 11. Web Search Agent
**File**: `agents/webSearchAgent.js` | **Definition**: `agents/web-search.md`
**Model**: claude-haiku-3-5
**Tools**: web_search, web_fetch

**Purpose**: Searches for solutions to runtime errors, package compatibility issues, or unknown error messages. Feeds results to the Fix Agent.

**When to use**: When Fix Agent encounters an error it cannot resolve from lessons/instincts.

### 12. Code Reviewer Agent
**Definition**: `agents/code-reviewer.md`
**Model**: claude-sonnet-4-5
**Tools**: read_file

**Purpose**: Performs deep code review for: performance issues, code smells, anti-patterns, maintainability concerns, documentation gaps.

**When to use**: On `/review` command or after successful build.

### 13. Security Reviewer Agent
**Definition**: `agents/security-reviewer.md`
**Model**: claude-sonnet-4-5
**Tools**: read_file, bash

**Purpose**: Focused security review covering OWASP Top 10, authentication flaws, authorization gaps, data exposure, insecure configurations.

**When to use**: On `/security-scan` command or before deployment.

### 14. TDD Guide Agent
**Definition**: `agents/tdd-guide.md`
**Model**: claude-sonnet-4-5
**Tools**: read_file, write_file

**Purpose**: Guides test-first development. Writes failing tests first, then implements code to pass them. Ensures high coverage.

**When to use**: When `/tdd-workflow` skill is active.

### 15. Refactor Agent
**Definition**: `agents/refactor-agent.md`
**Model**: claude-sonnet-4-5
**Tools**: read_file, write_file

**Purpose**: Refactors existing code for: reduced complexity, better naming, extracted functions, improved patterns, without changing behavior.

**When to use**: On explicit refactor requests or when code quality score drops below threshold.

### 16. Doc Writer Agent
**Definition**: `agents/doc-writer.md`
**Model**: claude-haiku-3-5
**Tools**: read_file, write_file

**Purpose**: Generates API documentation (OpenAPI/Swagger), README files, code comments, and architecture diagrams.

**When to use**: After successful build, on `/doc` command.

### 17. DB Reviewer Agent
**Definition**: `agents/db-reviewer.md`
**Model**: claude-sonnet-4-5
**Tools**: read_file

**Purpose**: Reviews database schemas for: normalization issues, missing indexes, N+1 query risks, missing foreign key constraints, migration safety.

**When to use**: When database schemas are generated or modified.

### 18. Python Reviewer Agent
**Definition**: `agents/python-reviewer.md`
**Model**: claude-sonnet-4-5
**Tools**: read_file, bash

**Purpose**: Python-specific review: PEP 8 compliance, type hint completeness, async patterns, FastAPI/Django idioms, dependency management.

**When to use**: When backend stack is Python.

### 19. TypeScript Reviewer Agent
**Definition**: `agents/typescript-reviewer.md`
**Model**: claude-sonnet-4-5
**Tools**: read_file, bash

**Purpose**: TypeScript-specific review: strict mode compliance, generic type usage, interface vs type alias, null safety, React patterns.

**When to use**: When frontend stack is TypeScript/React.

### 20. Loop Operator Agent
**Definition**: `agents/loop-operator.md`
**Model**: claude-opus-4-5
**Tools**: all

**Purpose**: Meta-agent that manages the autonomous self-improvement loop. Analyzes eval results, extracts lessons, updates instincts, adjusts provider scoring, identifies improvement trajectories.

**When to use**: Runs automatically via autonomousLoop.js every 10 minutes.

## Orchestration Rules

1. **Parallelism**: Backend and UI agents always run in parallel after architecture. Validator + Tester always run in parallel.
2. **Max Retries**: Fix loop max 3 iterations; escalate to web search on unknown errors.
3. **Model Selection**: Complex reasoning → Opus, Code generation → Sonnet, Simple tasks → Haiku.
4. **Fallback**: If primary engine fails, automatically try Claude → Gemini → Codex → OpenCode.
5. **Memory**: All agents receive relevant lessons/instincts injected into their prompts.
6. **Cancellation**: Any phase can be cancelled; partial results are preserved.
7. **Goal Loops**: Use verifier loops for "fix until passes" and completion loops for autonomous sessions.
8. **Dream Cycles**: Background consolidation every 2h promotes high-confidence instincts to skills.
9. **Version-First**: Every shipped build gets a version number and CHANGELOG entry.
10. **API Guardian**: ANY modification to API routes/schemas requires API Guardian approval.

## Inter-Agent Communication

Agents communicate via the `context` object passed through the pipeline:

```javascript
context = {
  prompt: "original user prompt",
  plan: { /* from planner */ },
  architecture: { /* from architect */ },
  files: { /* generated files by path */ },
  qaReport: { /* from QA auditor */ },
  issues: [ /* current issues to fix */ ],
  runResult: { /* from run agent */ },
  testResults: [ /* from API tester */ ],
  lessons: [ /* relevant from lessonStore */ ],
  instincts: [ /* high-confidence from instinctStore */ ]
}
```

## Usage Examples

### Build a full-stack app
```
User: Build a task management API with React frontend and PostgreSQL
→ Planner detects: FastAPI + React + PostgreSQL
→ Architect designs: 8 endpoints, 3 DB tables, JWT auth
→ Backend: generates main.py, models.py, auth.py, database.py
→ UI: generates App.jsx, TaskList.jsx, Login.jsx with real API calls
→ QA: validates security, contracts, imports
→ Fix: resolves 2 issues found
→ Run: app boots on port 8000
→ Test: 8/8 endpoints pass
→ Deploy: pushed to Railway
```

### Security scan only
```
/security-scan
→ Security Reviewer reads all source files
→ Checks: secrets, SQL injection, XSS, CORS, JWT, missing auth
→ Returns: 0 critical, 1 high (missing rate limiting), 3 medium
→ Suggests: add slowapi rate limiter
```

### Autonomous improvement
```
/autonomous start
→ Runs eval suite every 10 minutes
→ Score starts at 72/100
→ Extracts 3 new lessons from failures
→ 2 new instincts added (confidence: 0.8)
→ Score improves to 81/100 after 3 cycles
```

## Harness-Specific Notes

### Claude Code
- Skills loaded via `skills/*/SKILL.md`
- Commands in `commands/*.md`
- Hooks in `hooks/hooks.json`
- Full MCP integration via `lib/mcpServer.js`

### Cursor
- Use AI proxy at `http://localhost:3002/v1`
- `.cursorrules` applies project-wide conventions
- All prompts enhanced with memory/instincts via proxy

### Codex / OpenCode
- AGENTS.md is the primary configuration (this file)
- Set `OPENAI_API_KEY` and use `/build` command
- Memory persistence in `memory/` directory
