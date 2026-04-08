# Orchestrator X

**An autonomous AI coding agent that plans, builds, tests, fixes, and deploys — by itself.**

---

## What it does

Give it a goal. It figures out the rest.

```bash
python -m src.orchestrator "build a FastAPI CRUD API and run it"
```

The system will:
1. Plan a dependency-aware task graph
2. Inject relevant domain skills (889-skill catalog)
3. Run independent tasks in parallel via the Swarm engine
4. Execute sequential tasks with full retry + self-healing
5. Auto-install missing dependencies
6. Deploy and return a live URL

---

## Architecture

```
src/orchestrator/
├── core.py              — OrchestratorCore: the main loop
├── execution/
│   ├── llm_brain.py     — Multi-provider LLM (Claude / Groq / Ollama / Mock)
│   ├── memory_engine.py — Cross-session learning with confidence scoring
│   ├── skills.py        — 889-skill catalog injection
│   ├── tool_registry.py — Tool protocol + registry
│   ├── executor.py      — RuntimeExecutor
│   ├── auto_installer.py— pip auto-install missing imports
│   ├── env_probe.py     — Environment awareness
│   ├── validators.py    — AST syntax pre-validation
│   └── tools/
│       ├── FileEngine.py     — read / write / edit files
│       ├── SystemOperator.py — shell command execution
│       ├── DeployAgent.py    — launch web apps, return URLs
│       ├── GitTool.py        — git status/diff/log/add/commit
│       └── WebSearchTool.py  — DuckDuckGo search (no API key)
├── swarm/
│   └── manager.py       — Parallel task execution engine
├── evals/
│   ├── evaluator.py     — Benchmark runner
│   └── tasks/           — JSON benchmark task definitions
└── api/
    └── server.py        — FastAPI + WebSocket live dashboard
```

---

## Quickstart

```bash
# Mock mode (no API key needed)
python -m src.orchestrator "create hello.py that prints hello and run it"

# With Claude API key
ANTHROPIC_API_KEY=sk-ant-... python -m src.orchestrator "build a FastAPI login endpoint"

# With Groq (fast, free tier)
GROQ_API_KEY=gsk_... python -m src.orchestrator "write and run a fibonacci script"

# Live dashboard
python -m uvicorn src.orchestrator.api.server:app --reload
# then open http://localhost:8000
```

---

## LLM Providers

| Provider | Env Var | Notes |
|----------|---------|-------|
| `claude` | `ANTHROPIC_API_KEY` | Best reasoning |
| `groq`   | `GROQ_API_KEY` | Fast, free tier |
| `ollama` | *(none)* | Local, private |
| `mock`   | *(none)* | Deterministic, no key needed |
| `auto`   | *(auto-detect)* | Claude → Groq → Ollama → Mock |

---

## Run Benchmarks

```bash
python -m src.orchestrator.evals.evaluator mock
```

---

## Skills

The agent draws from an 889-skill catalog at runtime, injecting domain-specific knowledge into every LLM call. Preview which skills activate for a given prompt:

```bash
# Via API
GET /skills/preview?prompt=build+fastapi+app
```

Skill catalog: [antigravity-awesome-skills](https://github.com/rajbharti06/The-Orchestrator) (MIT License)

---

## Disclaimer

This project is an **independent, original implementation** of an AI agent harness.  
It is not affiliated with, endorsed by, or derived from Anthropic or any proprietary source.
