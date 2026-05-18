# Orchestrator X - Claude Code Instructions

## Project Overview

Orchestrator X is an autonomous multi-agent AI software engineering system that takes a natural language prompt and builds a complete, deployed application. It combines a multi-agent pipeline (Plan → Architect → Build → QA → Fix → Run → Test → Deploy) with continuous self-improvement via instinct-based learning.

## Architecture

```
orchestrator.js        ← Main pipeline coordinator
cli.js                 ← Global CLI (orchestrator build "...")
lib/
  llmRouter.js         ← Multi-provider LLM routing with fallback
  strategyLayer.js     ← Goal decomposition + dependency graph
  promptEnhancer.js    ← Injects memory/lessons/instincts into prompts
  lessonStore.js       ← Failure pattern learning
  successLearner.js    ← Success pattern extraction
  instinctStore.js     ← Confidence-scored learned instincts
  evalEngine.js        ← Self-scoring evaluation suite
  autonomousLoop.js    ← Self-improvement loop (runs every 10min)
  qualityGate.js       ← Build quality verification
  securityScanner.js   ← OWASP Top 10 vulnerability detection
  skillLoader.js       ← Dynamic skill injection
  jobQueue.js          ← Async job queue
  memoryStore.js       ← Cross-run memory persistence
  providerScoring.js   ← LLM provider scoring
  selfHeal.js          ← Subsystem health monitoring
  mcpServer.js         ← MCP protocol server
  aiProxy.js           ← OpenAI-compatible proxy
  apiServer.js         ← REST API + WebSocket server
  goalLoop.js          ← Verifier + completion loop patterns
  dreamCycle.js        ← Background memory consolidation (2hr cycles)
  multiEngine.js       ← Multi-CLI engine abstraction (Claude/Codex/Gemini/OpenCode)
  reportStore.js       ← Version-organized build reports
  taskBoard.js         ← Task board with backlog/in_progress/done states
  rarvLoop.js          ← RARV autonomous cycle (Reason→Act→Reflect→Verify)
  agentFederation.js   ← Named agent communication (pipeline/fan-out/supervisor)
  ragEngine.js         ← 4-step RAG pipeline (RETRIEVE→JUDGE→DISTILL→CONSOLIDATE)
  worktreeManager.js   ← Git worktree isolation per parallel agent
  ciLoop.js            ← CI monitoring + autonomous repair loop
  specParser.js        ← Spec intake: PRD/OpenAPI/GitHub issue/one-liner → BuildSpec
  continuityMemory.js  ← 3-layer memory: episodic + semantic + procedural
  swarmCoordinator.js  ← 8-swarm assembly, Raft consensus, inter-swarm coordination
  antiSycophancy.js    ← Blind review, 2/3 consensus, mutation detection
agents/
  plannerAgent.js      ← Detects stack, creates phases
  architectAgent.js    ← Designs file structure + API contracts
  backendAgent.js      ← Generates backend code
  uiAgent.js           ← Generates frontend code
  qaAgent.js           ← Security audit + contract validation
  fixAgent.js          ← Targeted issue repair
  runAgent.js          ← Boots app, captures errors
  apiTesterAgent.js    ← Makes real HTTP calls to endpoints
  githubAgent.js       ← Git commit and push
  hostingRouter.js     ← Multi-platform deployment
  webSearchAgent.js    ← Finds solutions to runtime errors
  researcher.md        ← Technology evaluation agent (haiku)
  api-guardian.md      ← API breaking change guardian (sonnet)
  code-reviewer.md     ← Comprehensive code review (sonnet)
  security-reviewer.md ← OWASP Top 10 security auditor (sonnet)
  tdd-guide.md         ← Test-driven development guide (sonnet)
  database-reviewer.md ← DB schema + query + migration reviewer (sonnet)
  validator.md         ← Code quality gate: types + tests + contracts (sonnet)
  tester.md            ← UX quality gate: E2E + screenshots + perf (sonnet)
  scribe.md            ← Documentation: CHANGELOG + VERSION + README (haiku)
  ci-agent.md          ← CI/CD monitoring + auto-fix agent (haiku)
  spec-analyst.md      ← Spec intake + normalization agent (sonnet)
  swarm-coordinator.md ← Meta-coordination + swarm assembly agent (sonnet)
skills/                ← 24 SKILL.md definitions (ECC + OpenClaw + GodMode + Loki + Ruflo patterns)
commands/              ← 16 slash command definitions
rules/
  common/security.md   ← OWASP security rules (always follow)
  common/testing.md    ← 80%+ coverage + TDD rules
  common/commits.md    ← Conventional commits standard
  typescript/style.md  ← TypeScript strict mode rules
  python/style.md      ← Python/FastAPI patterns
  golang/style.md      ← Go/Gin patterns
hooks/                 ← Claude Code hook configs
scripts/hooks/         ← Hook implementation scripts
public/                ← Dashboard UI (5-panel dark terminal theme)
memory/                ← Persisted lessons, instincts, history, dreams
reports/               ← Version-organized build reports (reports/v2.1.4/)
```

## Core Principles (from ECC + GodMode + OpenClaw + Loki + Ruflo)

- **Agent-First** — Delegate specialized work to domain agents (researcher, architect, guardian, builder, validator, tester, scribe)
- **Test-Driven** — 80%+ coverage; tests written before implementation
- **Security-First** — OWASP Top 10 checked on every build; secrets never hardcoded
- **Research-First** — @researcher runs before any architecture decision on unknown tech
- **Dual Quality Gates** — @validator (code) + @tester (UX) run in parallel; both must approve
- **Version-First** — Semantic versioning on every shipped build; CHANGELOG always updated
- **Dream Cycles** — Background memory consolidation every 2h using haiku-class model
- **Multi-Engine** — Claude, Codex, Gemini, OpenCode as swappable engines per task type
- **Goal Loops** — Verifier and completion loops for truly autonomous execution
- **RARV Cycles** — Reason→Act→Reflect→Verify: no-question autonomous execution
- **Agent Federation** — Named agents with 3 topologies: Pipeline, Fan-out/Fan-in, Supervisor/Worker
- **Swarm Intelligence** — 8 specialized swarms with Raft consensus for critical decisions
- **Anti-Sycophancy** — Blind 3-reviewer system, 2/3 consensus, mutation detection
- **RAG Memory** — 4-step pipeline: RETRIEVE→JUDGE→DISTILL→CONSOLIDATE across 6 namespaces
- **Spec-to-Product** — Any input format (PRD/OpenAPI/issue/brief) → deployed product
- **Worktree Isolation** — Each parallel agent gets an isolated git worktree + branch
- **CI-Fix Loop** — CI failures injected back to agents for autonomous repair (max 3x)

## Security Baseline

These rules apply to EVERY build. See `rules/common/security.md` for full list.
- Never hardcode secrets — use environment variables
- Validate all user input at system boundaries
- Parameterized queries only — no SQL string concatenation
- JWT secrets must be ≥256-bit random; tokens expire ≤1h
- CORS: explicit allowlist, never `*` in production

## Available Skills

Load any skill in Claude Code by typing `/orchestrator:<skillname>`:

| Skill | Purpose |
|-------|---------|
| `/orchestrator:godmode` | 8-agent GodMode orchestration (researcher→architect→builder→validator+tester→scribe) |
| `/orchestrator:build-pipeline` | Full 8-phase autonomous build |
| `/orchestrator:tdd-workflow` | Test-Driven Development workflow |
| `/orchestrator:tdd-workflow-v2` | Enhanced TDD with 80% coverage enforcement |
| `/orchestrator:security-review` | OWASP Top 10 security scan |
| `/orchestrator:api-design` | RESTful API design patterns |
| `/orchestrator:backend-patterns` | Backend best practices (Express/FastAPI/Django/Gin) |
| `/orchestrator:frontend-patterns` | Frontend patterns (React/Vue/Next.js/Svelte) |
| `/orchestrator:deployment-patterns` | Multi-platform deployment |
| `/orchestrator:database-migrations` | Safe zero-downtime migration patterns |
| `/orchestrator:eval-harness` | Self-scoring eval suite |
| `/orchestrator:verification-loop` | Quality gate verification loop |
| `/orchestrator:goal-loops` | Verifier + completion loop patterns |
| `/orchestrator:multi-engine` | Multi-CLI engine abstraction |
| `/orchestrator:dream-memory` | Background memory consolidation |
| `/orchestrator:strategic-compact` | Goal decomposition + dependency graph |
| `/orchestrator:autonomous-loops` | Self-improvement configuration |
| `/orchestrator:continuous-learning-v2` | Instinct-based learning |
| `/orchestrator:search-first` | Research-before-code pattern |
| `/orchestrator:rarv-cycles` | RARV autonomous execution (Reason→Act→Reflect→Verify) |
| `/orchestrator:agent-federation` | Named agent communication with 3 coordination topologies |
| `/orchestrator:swarm-intelligence` | 8-swarm architecture with Raft consensus |
| `/orchestrator:anti-sycophancy` | Blind review, 2/3 consensus, mutation detection |
| `/orchestrator:rag-memory` | 4-step RAG pipeline over all memory namespaces |
| `/orchestrator:spec-to-product` | Any spec format → deployed product |

## Available Commands

| Command | Description |
|---------|-------------|
| `/build` | Start full build pipeline |
| `/plan` | Plan-only mode (no code generation) |
| `/tdd` | Test-driven workflow (write tests first) |
| `/e2e` | E2E tests + screenshots + performance audit |
| `/code-review` | Comprehensive code review |
| `/build-fix` | Auto-fix build errors (loops up to 5x) |
| `/security-scan` | OWASP Top 10 security scan |
| `/quality-gate` | Run all quality checks |
| `/eval` | Run self-scoring eval suite |
| `/autonomous` | Toggle autonomous self-improvement loop |
| `/learn` | Teach a lesson manually |
| `/skill-create` | Create a new SKILL.md |
| `/instinct-status` | View learned instincts |
| `/spec` | Drop any spec format → deployed product |
| `/swarm` | Launch specialized agent swarm |
| `/ci-fix` | Monitor CI and autonomously fix failures |

## API Endpoints

### Build
- `POST /build` - Start a build: `{ prompt, stack?, deploy? }`
- `POST /cancel` - Cancel current build: `{ jobId }`
- `GET /status` - Current build status
- `GET /history` - Build history
- `GET /logs` - SSE stream of real-time logs

### Queue
- `POST /queue` - Queue a build job
- `GET /queue` - List queued jobs
- `GET /queue/:id` - Get job status
- `DELETE /queue/:id` - Cancel a job

### Intelligence
- `GET /insights` - Full intelligence report
- `GET /lessons` - Failure lessons learned
- `GET /successes` - Success patterns
- `POST /lessons` - Add a lesson manually
- `DELETE /lessons/:id` - Remove a lesson

### Instincts
- `GET /instincts` - All learned instincts
- `POST /instincts/prune` - Remove low-confidence instincts
- `POST /instincts/evolve` - Cluster instincts into skills

### Evaluation
- `POST /eval` - Run eval suite
- `GET /eval` - Latest eval results

### Autonomous Loop
- `POST /autonomous/start` - Start self-improvement loop
- `POST /autonomous/stop` - Stop the loop
- `GET /autonomous/status` - Loop status + score history

### Skills
- `GET /skills` - List all skills
- `GET /skills/:name` - Get skill content

### Security
- `POST /security-scan` - Scan code for vulnerabilities
- `POST /quality-gate` - Run quality gate

### System
- `GET /providers` - Provider scoring data
- `GET /health` - System health
- `GET /strategy` - Decompose a goal (no code generation)
- `WS /ws` - WebSocket for real-time updates

### Spec-to-Product
- `POST /spec` - Parse + build from any spec: `{ spec, dryRun?, deploy? }`

### Swarms
- `POST /swarm` - Launch swarm: `{ swarms, task, mode? }`
- `GET /swarm/status` - Active swarm status

### Worktrees
- `GET /worktrees` - List active git worktrees
- `DELETE /worktrees/:agent` - Remove agent worktree

### CI-Fix
- `POST /ci-fix` - Autonomous CI repair: `{ files, plan, ciResult, maxAttempts? }`

### RAG Memory
- `POST /rag` - Query RAG memory: `{ query, topK?, namespace? }`
- `GET /memory/episodes` - Episodic memory entries
- `GET /memory/semantic` - Semantic patterns (optional: `?domain=`)

## Autonomous Loop

The autonomous loop runs every 10 minutes when enabled:
1. Runs 8-test eval suite against real LLM calls
2. Scores outputs against expected patterns (0-100)
3. Analyzes failures to extract lessons
4. Updates instinct confidence scores
5. Adjusts provider scoring based on outcomes
6. Reports insights to dashboard

Enable: `POST /autonomous/start` or set `ENABLE_AUTONOMOUS_LOOP=true`

## Coding Standards

- **ES Modules**: All files use `import/export` (not `require`)
- **Async**: All I/O is async/await, no callbacks
- **Error Handling**: Every async function has try/catch with meaningful messages
- **Logging**: Use structured logging, never `console.log` in production
- **Security**: Never log API keys, never hardcode secrets
- **Paths**: Always use `path.join` or `import.meta.url` for file paths
- **Validation**: Validate all inputs with Zod schemas
- **Types**: Use JSDoc for type documentation

## Running the System

```bash
# Install dependencies
npm install

# Start dashboard (opens browser)
npm start

# Build an app from CLI
npx orchestrator build "Create a FastAPI backend with JWT auth and React frontend"

# Run eval suite
npm run eval

# Mock mode (no API keys needed)
MOCK=true npm start
```

## Mock Mode

Set `MOCK=true` to run without any API keys. The system returns deterministic mock responses for all LLM calls, allowing full pipeline testing without API costs.

## Memory Persistence

All data is persisted in the `memory/` directory:
- `lessons.json` - Failure patterns learned
- `successes.json` - Success patterns
- `instincts.json` - Confidence-scored instincts
- `history.json` - Build history
- `providers.json` - Provider scoring data

## Integration with Cursor / Trae

Start the AI proxy and configure Cursor to use `http://localhost:3002/v1` as the OpenAI API base URL. All prompts will be automatically enhanced with lessons and instincts.

```bash
npx orchestrator proxy
# Cursor settings: OpenAI API Base = http://localhost:3002/v1
```
