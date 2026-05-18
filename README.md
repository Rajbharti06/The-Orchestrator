# Orchestrator X

**The most powerful autonomous multi-agent AI software engineering system ever built.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Providers](https://img.shields.io/badge/Providers-6%20Elite-gold.svg)](#llm-providers)
[![Primary Coding](https://img.shields.io/badge/Primary%20Coding-MiniMax%20M2.5%20%E2%80%94%2080.2%25%20SWE--Bench-brightgreen.svg)](https://featherless.ai)
[![Reasoning](https://img.shields.io/badge/Reasoning-DeepSeek%20R1%20%E2%80%94%2090%25%20AIME-blue.svg)](https://deepseek.com)
[![Memory](https://img.shields.io/badge/Memory-GSW%20%2B%20ProcMEM%20%2B%20Episodic-purple.svg)](#memory-architecture)
[![Intelligence](https://img.shields.io/badge/Intelligence-Palantir%20%2B%20DARPA%20%2B%20AGoT-red.svg)](#palantir-grade-intelligence)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Agents](https://img.shields.io/badge/Agents-45-purple.svg)](#agents)
[![Skills](https://img.shields.io/badge/Skills-24-orange.svg)](#skills)
[![Multi-Engine](https://img.shields.io/badge/Engines-4-red.svg)](#multi-engine-support)
[![Swarms](https://img.shields.io/badge/Swarms-8-blue.svg)](#swarm-intelligence)

> Give it a goal in plain English — or drop a spec file, OpenAPI YAML, or GitHub issue. It plans, designs, builds, tests, secures, and deploys a full-stack application. Then learns from every run, runs blind consensus reviews, and gets better autonomously.

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

- **45 specialized agents** — pipeline agents + GodMode council + swarm coordinators + CI + spec analyst
- **24 SKILL.md workflow definitions** — RARV, federation, swarms, anti-sycophancy, RAG, spec-to-product + 18 more
- **17 slash commands** — `/build`, `/spec`, `/swarm`, `/think`, `/ci-fix`, `/tdd`, `/e2e`, and more
- **36 lib modules** — RAG engine, swarm coordinator, agent federation, RARV loop, CI-fix, 3-layer memory, **5 new intelligence engines** + more
- **6 LLM providers** — Featherless, Anthropic, Groq, Gemini, DeepSeek, Ollama (elite-only after v4.0 cleanup)
- **4 CLI engines** — Claude Code, Codex, Gemini CLI, OpenCode (swappable)
- **8 specialized swarms** — engineering, operations, business, data, product, growth, review, orchestration
- **11 quality gates** — security, imports, API contracts, mutation safety, backward compat, blind consensus + more
- **6 rule sets** — security, testing, commits, TypeScript, Python, Go (always-follow)
- **Palantir-grade intelligence** — THINK + RELATE + SUGGEST + EXECUTE + PRESENT pipeline on every build

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

| Skill | Source | Purpose |
|-------|--------|---------|
| `godmode` | GodMode v5 | 8-agent orchestration with dual quality gates |
| `build-pipeline` | ECC | Full 8-phase autonomous build workflow |
| `tdd-workflow` | ECC | Red-green-refactor with 80% coverage enforcement |
| `security-review` | ECC | OWASP Top 10 full audit |
| `api-design` | ECC | RESTful contract-first design patterns |
| `backend-patterns` | ECC | Express / FastAPI / Django / Gin production patterns |
| `frontend-patterns` | ECC | React / Vue / Next.js / Svelte component patterns |
| `database-migrations` | ECC | Zero-downtime migration patterns |
| `deployment-patterns` | ECC | Railway / Vercel / Render / Fly.io + Docker |
| `goal-loops` | ECC | Verifier loops + completion loops for autonomous agents |
| `multi-engine` | ECC | Swap Claude/Codex/Gemini/OpenCode per task |
| `dream-memory` | ECC | Background memory consolidation (2hr cycles) |
| `verification-loop` | ECC | QA loop with web-search fallback |
| `strategic-compact` | ECC | Goal decomposition + dependency graph |
| `eval-harness` | ECC | 8-case self-scoring eval suite |
| `autonomous-loops` | ECC | Self-improvement configuration |
| `continuous-learning-v2` | ECC | Instinct-based learning system |
| `search-first` | ECC | Research-before-code pattern |
| `rarv-cycles` | Loki Mode | RARV autonomous execution (Reason→Act→Reflect→Verify) |
| `agent-federation` | Ruflo/Claude Flow v3 | Named agents with Pipeline / Fan-out / Supervisor topologies |
| `swarm-intelligence` | Loki Mode | 8-swarm architecture with Raft consensus |
| `anti-sycophancy` | Loki Mode | Blind 3-reviewer system, 2/3 consensus, mutation detection |
| `rag-memory` | Ruflo | 4-step RAG pipeline over 6 memory namespaces |
| `spec-to-product` | Loki Mode | Any spec format (PRD/OpenAPI/issue/brief) → deployed product |

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
| `/quality-gate` | All 11 quality gates with pass/fail |
| `/eval` | Run self-scoring eval suite |
| `/autonomous` | Toggle 10-minute improvement loop |
| `/learn` | Manually teach a lesson |
| `/skill-create` | Generate a new SKILL.md |
| `/instinct-status` | View learned instincts + confidence |
| `/spec` | Drop any spec → deployed product (PRD/OpenAPI/issue/brief) |
| `/swarm` | Launch a specialized agent swarm with consensus |
| `/ci-fix` | Monitor CI pipeline + autonomously fix failures |
| `/think` | Full THINK→RELATE→SUGGEST→EXECUTE→PRESENT intelligence pipeline |

---

## Palantir-Grade Intelligence

The most powerful capability: **THINK → RELATE → SUGGEST → EXECUTE → PRESENT** — a full intelligence pipeline inspired by Palantir Gotham, DARPA KAIROS, and NSA-grade analytical systems. Runs automatically on every complex build and standalone via `/think`.

### 5 Intelligence Primitives

```
THINK       → Adaptive Graph of Thoughts (AGoT, arXiv:2502.05078)
              Recursive reasoning DAG — only expands nodes where uncertainty is high
              +46.2% GPQA vs. standard CoT. Synthesizes leaf conclusions into final answer.

RELATE      → i2 Analyst's Notebook + Palantir Entity-Link-Property methodology
              Extracts typed entities (person/org/event/threat/artifact/location)
              "Search around" BFS: finds indirect connections A→B→C across the graph
              All entities stored in persistent Palantir-style Dynamic Ontology

SUGGEST     → DARPA KAIROS schema-matching + abductive inference
              Classifies event type (supply-chain-attack, ransomware, insider-threat...)
              Generates ranked hypotheses with evidence chains, predicted indicators,
              counter-evidence, and actions to verify each hypothesis

EXECUTE     → A2P causal planning (arXiv:2509.10401): Abduct → Act → Predict
              Abduct: infer hidden root causes behind the situation
              Act: design minimal interventions targeting root causes (not symptoms)
              Predict: simulate counterfactual trajectory + failure modes for each action

PRESENT     → IC Analytic Standards (NSA/CIA format)
              BLUF (Bottom Line Up Front) — one-sentence verdict
              Key Judgments with HIGH/MEDIUM/LOW confidence levels
              Evidence chains with source attribution
              Full markdown intelligence report
```

### Knowledge Graph Architecture

| Module | Research Basis | Capability |
|--------|---------------|------------|
| `thinkEngine.js` | AGoT (+46.2% GPQA) · DARPA KAIROS · IC Standards | Full 5-primitive pipeline |
| `ontologyEngine.js` | Palantir Gotham · i2 ELP methodology | Dynamic entity-link-property graph |
| `knowledgeGraph.js` | HippoRAG 2 (ICML '25) · GraphRAG · EvoReasoner | PPR retrieval + community detection |
| `causalEngine.js` | A2P (arXiv:2509.10401) · CRAwDAD · Pearl do-calculus | Causal inference + counterfactuals |
| `temporalReasoner.js` | EvoReasoner (+23.3%) · CHRONOS · TempoRAG | Time-aware facts + drift detection |

### Dynamic Ontology (Palantir Architecture)

Three layers — exactly how Palantir Gotham structures intelligence data:

```
SEMANTIC  — Entity type definitions (person, org, event, artifact, location, threat, concept, action)
KINETIC   — Live entity state (current facts, confidence scores, source attribution)
DYNAMIC   — Temporal history (how entities evolve, contradiction resolution, validity windows)
```

New entity types are discovered and auto-added to the schema ("dynamic ontology").

### Causal Reasoning (CRAwDAD + A2P)

```
Dual-agent debate: Reasoner proposes causal claim → Critic challenges →
they debate 3 rounds → neutral arbiter renders verdict
Accuracy: 67.94% → 80.04% on causal benchmarks (CRAwDAD, arXiv:2504.17445)

A2P planning: Abduct hidden factors → Act with minimal interventions →
Predict counterfactual trajectories with failure modes
```

### Temporal Intelligence (EvoReasoner)

```
temporalSnapshot("2024-01-15")   → reconstruct world state at any point in time
detectDrift(since, until)         → which facts changed significantly in a window
forecastTrend(subject, horizon)   → project current trends with 3-scenario model
anomalyDetect()                   → flag temporal anomalies (CHRONOS-inspired)
temporalQuery(subject, decayDays) → confidence decays exponentially with age
```

### Usage

```bash
# Standalone intelligence query
/think Is our authentication system vulnerable to credential stuffing?

# Via CLI
orchestrator think "Analyze the threat actor behind these indicators: ..."

# Via API
curl -X POST http://localhost:3000/intelligence/think \
  -d '{"question": "What is causing the authentication spike?"}'

# Automatic on every complex build (intelligence !== false)
curl -X POST http://localhost:3000/build \
  -d '{"prompt": "...", "intelligence": true}'
```

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

## Swarm Intelligence

8 specialized agent swarms with automatic assembly and Raft consensus for critical decisions.

| Swarm | Agents | Triggers |
|-------|--------|---------|
| `engineering` | backend, frontend, architect, planner | Any build |
| `operations` | deploy, ci-agent, run-agent | Deployments |
| `business` | spec-analyst, researcher | New specs |
| `data` | database-reviewer, data-modeler | Schema changes |
| `product` | tester, ux-reviewer | UI changes |
| `growth` | scribe, doc-writer | Documentation |
| `review` | validator, security-reviewer, code-reviewer, api-guardian | All builds |
| `orchestration` | planner, goal-loop-controller | Complex/autonomous |

**Auto-assembly:** `low complexity → engineering + review` · `high complexity → all 8 swarms`

```bash
/swarm review "Audit the payment processing module for PCI compliance"
/swarm engineering "Refactor auth module to refresh tokens"
```

---

## Anti-Sycophancy

The most insidious failure mode: agents that agree with each other even when wrong.

**Blind Review Protocol** — 3 independent reviewers see code with zero knowledge of other reviews:

```
reviewer 1 ─┐
reviewer 2  ├─→ consensus gate (2/3 required) → APPROVED / BLOCKED
reviewer 3 ─┘
```

**11 Quality Gates:**

| Gate | Blocks? |
|------|---------|
| Security scan (OWASP) | YES |
| Import validation | YES |
| API contract compliance | YES |
| Error handling | YES |
| Env var documentation | Warn |
| Complexity | Warn |
| Mutation safety | YES |
| Backward compatibility | YES |
| Documentation coverage | Warn |
| Anti-sycophancy score | Warn |
| Blind review consensus | YES |

**Anti-sycophancy score:** 0.0 (pure sycophancy) → 1.0 (genuinely diverse reviews). Score < 0.3 triggers a re-run warning.

---

## RAG Memory

4-step pipeline surfaces the most relevant lessons at build time — no vector database required:

```
RETRIEVE  → TF-IDF scoring across all memory namespaces (<5ms)
    ↓
JUDGE     → LLM scores each candidate's relevance 0-1 (~500ms)
    ↓
DISTILL   → Extract the core insight from top results (~300ms)
    ↓
CONSOLIDATE → EWC merge: preserve if new confidence < 0.7 (<10ms)
```

**6 Memory Namespaces:** `lessons` · `instincts` · `builds` · `skills` · `episodic` · `semantic`

RAG context is automatically injected into every agent prompt when confidence > 0.5.

---

## Spec-to-Product

Drop any spec format and get a deployed product:

```bash
/spec ./requirements.md            # PRD markdown
/spec ./api.yaml                   # OpenAPI YAML
/spec https://github.com/org/repo/issues/42   # GitHub issue
/spec "Build a Slack clone with channels and DMs"  # One-liner
```

All formats normalize to the same `BuildSpec` → feeds the full 8-phase pipeline.

---

## RARV Cycles

Truly autonomous execution — no questions asked:

```
REASON  → Analyze goal, surface constraints, pick approach
ACT     → Execute with full tool access
REFLECT → Score result: did it satisfy the goal?
VERIFY  → If not, loop. If yes, commit and move to next phase.
```

Human intervention signals: write `.loki/PAUSE` (pause), `.loki/STOP` (stop), `.loki/HUMAN_INPUT.md` (inject guidance).

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

Six elite providers, selected by 2026 benchmark performance. Removed: xAI (grok-beta — not specialized for code), Mistral (outperformed by DeepSeek), OpenRouter (redundant meta-layer).

Smart routing by task type — best-benchmark-first with automatic fallback:

| Provider | Primary Models | Task Routing | Why |
|----------|---------------|--------------|-----|
| **Featherless** | MiniMax-M2.5, Qwen3-235B, DeepSeek-R1, Kimi-K2 | **coding** (primary) | MiniMax-M2.5: 80.2% SWE-Bench — #1 open-source coding (2026) |
| **Anthropic** | Opus 4.7, Sonnet 4.6, Haiku 4.5 | planning, security, reasoning | Best tool-calling stability + long-horizon recovery |
| **DeepSeek** | R1 (reasoner), V3 (chat) | **reasoning** (primary) | R1: 90% AIME — best open-source reasoning |
| **Gemini** | 2.5 Pro, 2.5 Flash | **longcontext** (primary) | 2M token context — full codebase analysis |
| **Groq** | Llama 3.3 70B, tool-use | **fast**, qa | Sub-200ms inference — ideal for rapid iteration |
| **Ollama** | Qwen2.5, Qwen2.5-Coder, DeepSeek-R1 | offline/private | Zero cost, full control, air-gapped environments |

**Routing intelligence:**
```
coding      → featherless (MiniMax-M2.5)  → anthropic → deepseek → groq
planning    → anthropic (Opus 4.7)         → featherless → gemini → deepseek
reasoning   → deepseek (R1)                → featherless → anthropic → gemini
security    → anthropic                    → featherless → deepseek → gemini
longcontext → gemini (2.5 Pro, 2M ctx)    → featherless → anthropic
fast/qa     → groq (sub-200ms)            → featherless → anthropic
```

Configure in `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
FEATHERLESS_API_KEY=sk-...        # Free tier at featherless.ai
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...
GEMINI_API_KEY=AIza...
OLLAMA_BASE_URL=http://localhost:11434
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
  prmVerifier.js       ← Process Reward Model — step-wise pipeline verification
  councilMode.js       ← 3-phase council consensus: Triage→Debate→Synthesis
  ragEngine.js         ← GSW RAG: TF-IDF + Semantic Workspace (20% better than vector RAG)
  antiSycophancy.js    ← Multi-provider blind review + adversarial red-team debate
  thinkEngine.js       ← THINK→RELATE→SUGGEST→EXECUTE→PRESENT intelligence pipeline (NEW)
  ontologyEngine.js    ← Palantir Gotham dynamic ontology: ELP + searchAround BFS (NEW)
  knowledgeGraph.js    ← HippoRAG 2 KG: Personalized PageRank + community detection (NEW)
  causalEngine.js      ← A2P + CRAwDAD causal inference: counterfactuals + do-calculus (NEW)
  temporalReasoner.js  ← EvoReasoner temporal intelligence: snapshots + drift + forecasts (NEW)
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
