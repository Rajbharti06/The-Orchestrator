# Orchestrator X

**The most powerful autonomous multi-agent AI software engineering system.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Agents](https://img.shields.io/badge/Agents-42-purple.svg)](#agents)
[![Skills](https://img.shields.io/badge/Skills-18-orange.svg)](#skills)
[![Multi-Engine](https://img.shields.io/badge/Engines-4-red.svg)](#multi-engine-support)
[![Providers](https://img.shields.io/badge/LLM_Providers-9-yellow.svg)](#llm-providers)

> Give it a goal in plain English. It plans, designs, builds, tests, secures, and deploys a full-stack application — then learns from every run to get better.

---

## What It Does

```
You:  "Build a SaaS dashboard with JWT auth, Stripe billing, and real-time analytics"

Orchestrator X:
  ├─ Researcher    → evaluates stack choices, surfaces best practices
  ├─ Planner       → decomposes goal into phases with dependency graph
  ├─ Architect     → designs file structure, API contracts, DB schema
  ├─ Backend       ┐
  │                ├─ parallel generation
  ├─ Frontend      ┘
  ├─ API Guardian  → blocks breaking API changes before they ship
  ├─ QA Auditor    → OWASP security scan + contract validation
  ├─ Validator     ┐
  │                ├─ parallel quality gates (both must approve)
  ├─ Tester        ┘ E2E + screenshots + LCP/INP/CLS thresholds
  ├─ Scribe        → CHANGELOG + VERSION + API docs
  └─ Deploy        → Railway / Vercel / Render / Fly.io

Result: running, tested, documented, deployed application
        stored in memory → next build is smarter
```

---

## Core Statistics

- **42 specialized agents** — pipeline agents + GodMode review council
- **18 SKILL.md workflow definitions** — loadable knowledge collections
- **13 slash commands** — `/build`, `/tdd`, `/e2e`, `/code-review`, `/security-scan`, and more
- **22 lib modules** — goal loops, dream cycles, multi-engine, task board, eval harness
- **9 LLM providers** — Anthropic, OpenAI, Groq, Gemini, Mistral, DeepSeek, xAI, OpenRouter, Ollama
- **4 CLI engines** — Claude Code, Codex, Gemini CLI, OpenCode (swappable)
- **6 rule sets** — security, testing, commits, TypeScript, Python, Go (always-follow)

---

## Installation

```bash
git clone https://github.com/Rajbharti06/The-Orchestrator.git
cd The-Orchestrator
npm install
cp .env.example .env   # add your API keys
npm start              # dashboard at http://localhost:3000
```

### Mock Mode (no API keys needed)

```bash
MOCK=true npm start
```

### Global CLI

```bash
npm link
orchestrator build "Create a FastAPI backend with JWT auth and React frontend"
```

---

## Quick Start

### 1. Build an app

```bash
# Via dashboard
open http://localhost:3000
# Type your goal and click Build

# Via CLI
orchestrator build "SaaS task manager with teams, roles, and Stripe billing"

# Via API
curl -X POST http://localhost:3000/build \
  -H "Content-Type: application/json" \
  -d '{"prompt": "REST API with PostgreSQL and JWT auth"}'
```

### 2. GodMode — full 8-agent council

Prefix your prompt with the workflow type:

```
GodMode feature: Add OAuth2 login with GitHub and Google
GodMode api-change: Rename /users to /api/v2/accounts
GodMode bugfix: Fix the race condition in the job queue
```

### 3. Test quality without API keys

```bash
npm run eval:mock    # runs eval suite in mock mode
node cli.js status   # system intelligence report
```

---

## Agents

### Pipeline Agents (11 JS agents)

| Agent | Purpose | Model |
|-------|---------|-------|
| Planner | Stack detection + phase dependency graph | sonnet |
| Architect | File structure + API contracts + DB schema | sonnet |
| Backend | Code generation (FastAPI/Express/Django/Gin) | sonnet |
| Frontend | UI generation (React/Vue/Next.js/Svelte) | sonnet |
| QA Auditor | OWASP scan + contract validation + fix loop | sonnet |
| Fix Agent | Targeted repair with lesson injection | sonnet |
| Run Agent | App boot verification | haiku |
| API Tester | Real HTTP calls to every endpoint | haiku |
| Web Search | Error solution discovery | haiku |
| GitHub Agent | Git commit + push with meaningful messages | haiku |
| Hosting Router | Deploy to Railway/Vercel/Render/Fly.io | haiku |

### GodMode Review Council (9 MD agents)

| Agent | Role | Model |
|-------|------|-------|
| @researcher | Technology evaluation (30s timeout) | haiku |
| @architect | Architecture decisions + module planning | opus |
| @api-guardian | **MANDATORY** for all API modifications | sonnet |
| @builder | Code generation per architect spec | sonnet |
| @validator | Types + tests + 80% coverage + contracts | sonnet |
| @tester | E2E + screenshots (3 viewports) + LCP/INP/CLS | sonnet |
| @scribe | CHANGELOG + VERSION + README automation | haiku |
| @github-manager | Issues + PRs + releases | haiku |
| @code-reviewer | Full review: correctness, performance, security | sonnet |

#### GodMode Workflows

```
New Feature:   researcher → architect → builder → validator + tester → scribe
Bug Fix:       builder → validator + tester
API Change:    researcher → architect → api-guardian → builder → gates → scribe
Refactoring:   architect → builder → validator + tester
Release:       scribe → github-manager
```

#### Decision Matrix

| @validator | @tester | Next Action |
|------------|---------|-------------|
| ✅ APPROVED | ✅ APPROVED | → @scribe (proceed) |
| ✅ APPROVED | 🔴 BLOCKED | → @builder (fix UX issues) |
| 🔴 BLOCKED | ✅ APPROVED | → @builder (fix code issues) |
| 🔴 BLOCKED | 🔴 BLOCKED | → @builder (combined feedback) |

---

## Skills

Load any skill by typing `/orchestrator:<name>` in Claude Code:

| Skill | Purpose |
|-------|---------|
| `godmode` | 8-agent orchestration with dual quality gates |
| `build-pipeline` | Full 8-phase autonomous build workflow |
| `tdd-workflow` | Red-green-refactor with 80% coverage enforcement |
| `security-review` | OWASP Top 10 full audit |
| `api-design` | RESTful contract-first design patterns |
| `backend-patterns` | Express / FastAPI / Django / Gin production patterns |
| `frontend-patterns` | React / Vue / Next.js / Svelte component patterns |
| `database-migrations` | Zero-downtime migration patterns |
| `deployment-patterns` | Railway / Vercel / Render / Fly.io + Docker |
| `goal-loops` | Verifier loops + completion loops for autonomous agents |
| `multi-engine` | Swap Claude/Codex/Gemini/OpenCode per task |
| `dream-memory` | Background memory consolidation (2hr cycles) |
| `verification-loop` | QA loop with web-search fallback |
| `strategic-compact` | Goal decomposition + dependency graph |
| `eval-harness` | 8-case self-scoring eval suite |
| `autonomous-loops` | Self-improvement configuration |
| `continuous-learning-v2` | Instinct-based learning system |
| `search-first` | Research-before-code pattern |

---

## Commands

| Command | Description |
|---------|-------------|
| `/build` | Start full autonomous build pipeline |
| `/plan` | Plan-only mode — phases + stack, no code |
| `/tdd` | Test-driven workflow: failing tests first |
| `/e2e` | E2E tests + screenshots + performance audit |
| `/code-review` | Full review: correctness, perf, security |
| `/build-fix` | Auto-fix build errors (loops up to 5×) |
| `/security-scan` | OWASP Top 10 scan |
| `/quality-gate` | All 6 quality checks with pass/fail |
| `/eval` | Run self-scoring eval suite |
| `/autonomous` | Toggle 10-minute improvement loop |
| `/learn` | Manually teach a lesson |
| `/skill-create` | Generate a new SKILL.md |
| `/instinct-status` | View learned instincts + confidence |

---

## Self-Improvement System

Orchestrator X gets smarter with every build — automatically.

### How It Works

```
Build runs → failures captured → lessons extracted
         → instincts updated (Bayesian confidence)
         → high-confidence instincts → graduated to skills
         → next build receives injected knowledge
```

### Eval Suite (8 cases)

| Case | Measures |
|------|---------|
| `hello-api` | Basic code generation quality |
| `jwt-auth` | Auth pattern accuracy |
| `react-form` | Frontend component quality |
| `crud-api` | Architecture coherence |
| `stack-detection` | Planning intelligence |
| `security-review` | OWASP scanner accuracy |
| `db-schema` | Database reviewer quality |
| `deployment-plan` | Deployment pattern accuracy |

```bash
npm run eval          # full eval with API keys
npm run eval:mock     # mock mode, no keys needed
```

### Autonomous Loop

```bash
# Enable via API
curl -X POST http://localhost:3000/autonomous/start

# Or via CLI
node cli.js autonomous start
```

Runs eval every 10 minutes → extracts lessons → updates instincts → prunes expired entries → graduates top instincts to skills.

### Dream Cycles

Background consolidation runs every **2 hours** using a haiku-class model:
- Reflects on recent build history
- Extracts generalizable patterns
- Updates instinct confidence scores
- Promotes high-confidence instincts to skills
- Journals every cycle to `memory/dreams.jsonl`

```bash
# Manual trigger
curl -X POST http://localhost:3000/dreams/run
```

---

## Multi-Engine Support

Swap the underlying AI CLI without changing any business logic:

| Engine ID | CLI | Best For |
|-----------|-----|---------|
| `claude` | Claude Code | Planning, architecture, security (default) |
| `codex` | OpenAI Codex | Python, data science, ML |
| `gemini` | Gemini CLI | Long-context (1M tokens), multimodal |
| `opencode` | OpenCode | Open-source alternative |

```bash
# Per-build engine selection
ENGINE=gemini npm start

# Via API
curl -X POST http://localhost:3000/build \
  -d '{"prompt": "...", "engine": "codex"}'
```

Automatic fallback chain: `claude → gemini → codex → opencode`

---

## LLM Providers

Automatic multi-provider routing with fallback:

| Provider | Task Strengths |
|----------|---------------|
| Anthropic (Claude) | Planning, architecture, security, reasoning |
| OpenAI (GPT-4o) | General coding, fast iteration |
| Groq | Ultra-fast inference (llama models) |
| Google Gemini | Long context, multimodal |
| Mistral | European data residency |
| DeepSeek | Cost-efficient coding |
| xAI (Grok) | Real-time knowledge |
| OpenRouter | Provider aggregator |
| Ollama | Local, privacy-first |

Configure in `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=...
```

---

## API Reference

### Build
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/build` | POST | Start a build: `{ prompt, engine?, deploy? }` |
| `/cancel` | POST | Cancel: `{ jobId }` |
| `/status` | GET | Current build status |
| `/history` | GET | Build history |
| `/logs` | GET | SSE stream of real-time logs |

### Intelligence
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/insights` | GET | Full intelligence report |
| `/lessons` | GET/POST | Failure lessons |
| `/instincts` | GET | Confidence-scored instincts |
| `/eval` | POST | Run eval suite |
| `/autonomous/start` | POST | Start improvement loop |
| `/autonomous/status` | GET | Loop status + score history |
| `/dreams/run` | POST | Trigger dream cycle |
| `/dreams/journal` | GET | Dream journal entries |

### System
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/engines` | GET | List available CLI engines |
| `/tasks` | GET/POST | Task board (backlog/in_progress/done) |
| `/reports` | GET | List versioned build reports |
| `/reports/:version` | GET | Get reports for a version |
| `/skills` | GET | All loaded skills |
| `/providers` | GET | Provider scoring data |
| `/health` | GET | System health check |
| `/ws` | WebSocket | Real-time build events |

---

## Task Board

Track work across agents with explicit state transitions:

```bash
# List tasks
curl http://localhost:3000/tasks

# Add a task
curl -X POST http://localhost:3000/tasks \
  -d '{"title": "Add OAuth2 login", "priority": 8, "assignee": "@builder"}'

# Update status
curl -X PATCH http://localhost:3000/tasks/:id \
  -d '{"status": "in_progress"}'
```

States: `backlog → in_progress → done | blocked | cancelled`

---

## Rules (Always-Follow)

Every generated file follows these standards automatically:

| Rule Set | File | Coverage |
|----------|------|---------|
| Security | `rules/common/security.md` | OWASP Top 10, secrets, JWT, CORS |
| Testing | `rules/common/testing.md` | 80% coverage, TDD, AAA pattern |
| Commits | `rules/common/commits.md` | Conventional commits |
| TypeScript | `rules/typescript/style.md` | Strict mode, null safety, async |
| Python | `rules/python/style.md` | PEP 8, Pydantic v2, FastAPI |
| Go | `rules/golang/style.md` | gofmt, errgroup, context propagation |

---

## IDE Integration

### Cursor / Trae

Start the AI proxy and point Cursor at it:

```bash
node cli.js proxy
# Cursor Settings → OpenAI API Base → http://localhost:3002/v1
```

Every prompt is transparently enhanced with lessons and instincts from your build history.

### Claude Code

Skills auto-load from `skills/*/SKILL.md`. Commands available via `commands/*.md`. Hooks fire on session start/end and file edits via `hooks/hooks.json`.

### Any AGENTS.md-Compatible Harness

`AGENTS.md` is the primary configuration for Codex, OpenCode, and other harnesses that support the AGENTS.md standard.

---

## Project Structure

```
orchestrator.js        ← Main pipeline coordinator
cli.js                 ← Global CLI
lib/
  llmRouter.js         ← 9-provider LLM routing + fallback
  strategyLayer.js     ← Goal decomposition + dependency graph
  promptEnhancer.js    ← Memory/lessons/instincts → agent prompts
  evalEngine.js        ← 8-case self-scoring eval suite
  autonomousLoop.js    ← 10-minute improvement loop
  goalLoop.js          ← Verifier + completion loop patterns
  dreamCycle.js        ← Background memory consolidation
  multiEngine.js       ← Claude/Codex/Gemini/OpenCode abstraction
  reportStore.js       ← Version-organized build reports
  taskBoard.js         ← Task board: backlog/in_progress/done
  memoryStore.js       ← Cross-run memory persistence
  lessonStore.js       ← Failure pattern learning
  instinctStore.js     ← Bayesian confidence-scored instincts
  successLearner.js    ← Success pattern extraction
  qualityGate.js       ← 6-check quality verification
  securityScanner.js   ← OWASP Top 10 detection (17 patterns)
  skillLoader.js       ← Dynamic SKILL.md loading
  jobQueue.js          ← Priority queue + cancellation
  selfHeal.js          ← Subsystem health monitoring
  apiServer.js         ← REST API + SSE + WebSocket server
  aiProxy.js           ← OpenAI-compatible proxy (port 3002)
agents/                ← 11 JS pipeline agents + 9 MD review agents
skills/                ← 18 SKILL.md workflow definitions
commands/              ← 13 slash command definitions
rules/                 ← 6 always-follow coding standards
hooks/                 ← Claude Code automation hooks
memory/                ← lessons · instincts · history · dreams
reports/               ← Version-organized build reports
public/                ← Dashboard (dark terminal theme, 5 panels)
```

---

## Dashboard

Access at `http://localhost:3000` after `npm start`.

**5 main panels:**
- **Build Pipeline** — prompt input, engine selector, progress bar, live stats
- **Intelligence** — tabs: Eval scores, Lessons, Autonomous loop, GodMode, Dreams
- **Build Log** — real-time streaming output per phase
- **Sidebar** — build history, top instincts, provider scores, engines, task board, reports

---

## Contributing

Contributions welcome. High-priority areas:

- **New agent definitions** — language-specific reviewers (Rust, Swift, Java, C++)
- **New skills** — framework configs (Rails, Laravel, Spring Boot), ML/data patterns
- **New engines** — adapters for new AI CLIs
- **New LLM providers** — additional provider integrations

### Commit convention

```
feat(agents): add Rust reviewer agent
fix(qa): handle empty file list in security scan
docs(readme): update API reference table
```

---

## License

**MIT** — use freely, modify, contribute back if able.

---

**Start with `MOCK=true npm start`. Build something. Star if it helps.**
