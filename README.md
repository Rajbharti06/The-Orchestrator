# The Orchestrator

An autonomous AI software engineer. Give it a goal — it plans, builds, tests, self-corrects, and ships. No hand-holding.

---

## What it does

```
"build a FastAPI login system with JWT auth and a React dashboard"
```

The system will:

1. **Plan** — detect stack from the prompt, break goal into phases
2. **Architect** — design file structure, API contracts, and schemas before writing a single line
3. **Build** — generate backend and frontend files in parallel
4. **Validate** — check contracts, requirements, and stack compliance automatically
5. **QA → Fix loop** — find issues and fix them, up to 5 attempts
6. **Run** — start the app and verify it actually boots
7. **API Test** — probe every endpoint and fix failures
8. **Learn** — store what failed and what worked for the next run
9. **Deploy** — push to GitHub and optionally ship to Vercel / Render / Fly.io

---

## Architecture

```
orchestrator.js          — main pipeline coordinator
agents/
├── plannerAgent.js      — stack detection + task planning
├── architectAgent.js    — system design before coding
├── backendAgent.js      — generates Python/FastAPI files
├── uiAgent.js           — generates React JSX files
├── qaAgent.js           — audits generated code for issues
├── fixAgent.js          — repairs issues found by QA or runtime
├── runAgent.js          — starts the app, captures errors
├── apiTesterAgent.js    — hits endpoints, validates responses
├── githubAgent.js       — commits and pushes to GitHub
├── hostingRouter.js     — routes to Vercel / Render / Fly.io
└── webSearchAgent.js    — searches for solutions to runtime errors
lib/
├── llmRouter.js         — multi-provider LLM with automatic fallback
├── strategyLayer.js     — multi-phase goal decomposition
├── lessonStore.js       — persistent failure learning
├── successLearner.js    — persistent success pattern learning
├── evalEngine.js        — built-in self-scoring eval suite
├── autonomousLoop.js    — self-improving loop (no human needed)
├── selfHeal.js          — subsystem health monitoring + repair
├── jobQueue.js          — async build queue
├── memoryStore.js       — cross-run memory
├── providerScoring.js   — ranks LLM providers by past performance
└── apiServer.js         — REST API + SSE log streaming
public/
├── index.html           — web dashboard
├── script.js            — real-time UI
└── styles.css
```

---

## Quickstart

```bash
npm install

# Copy env template
cp .env.example .env
# Add at least one LLM key (GROQ_API_KEY is free and fast)

# Start the web dashboard
npm run server
# open http://localhost:5001

# Or run from the command line
node orchestrator.js "build a task manager API with FastAPI and PostgreSQL"
```

---

## LLM Providers

Set at least one key in `.env`. The system auto-routes based on task type (planning vs. code vs. QA) and past provider performance.

| Provider | Env Var | Notes |
|----------|---------|-------|
| Groq | `GROQ_API_KEY` | Fast, free tier |
| xAI / Grok | `XAI_API_KEY` | Strong reasoning |
| OpenAI | `OPENAI_API_KEY` | GPT-4o-mini default |
| Anthropic | `ANTHROPIC_API_KEY` | Claude |
| Mistral | `MISTRAL_API_KEY` | mistral-large |
| OpenRouter | `OPENROUTER_API_KEY` | Access to many models |
| Gemini | `GEMINI_API_KEY` | Flash 1.5 |
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-coder |
| Ollama | `OLLAMA_BASE_URL` | Local, no key needed |

---

## Autonomous Mode

The system can improve itself without any input.

```bash
# Via API
curl -X POST http://localhost:5001/autonomous/start

# Or click "▶ Start Loop" in the dashboard
```

Every cycle:
1. Runs the built-in eval suite (4 test cases)
2. Identifies weak areas
3. Writes lessons to memory
4. Sleeps, then repeats

Each run is smarter than the last.

---

## API Endpoints

```
POST /build              — start a build
POST /cancel             — cancel running build
GET  /status             — current build state
GET  /history            — last 20 builds
GET  /logs               — SSE log stream

POST /queue              — queue a build job
GET  /queue              — list all jobs
GET  /queue/:id          — get one job

POST /eval               — run eval suite
GET  /eval               — eval history + trend + weak areas
GET  /insights           — full intelligence report

POST /autonomous/start   — start autonomous loop
POST /autonomous/stop    — stop it
GET  /autonomous/status  — loop state + score history
POST /autonomous/run-cycle — trigger one cycle manually

GET  /lessons            — failure lesson database
GET  /successes          — success pattern database
GET  /strategy           — current execution strategy
GET  /providers          — active LLM providers
GET  /health             — subsystem health
```

---

## Mock Mode

No LLM keys? Use mock mode for instant deterministic output.

```bash
MOCK=true node orchestrator.js "build login system"
MOCK=true npm run server
```

---

## Memory

Everything the system learns is persisted in `memory/`:

| File | Contents |
|------|----------|
| `lessons.json` | Failure patterns + prevention rules |
| `successes.json` | Successful build patterns |
| `eval_results.json` | Eval scores over time |
| `memory.json` | Prompts, runs, issues, preferences |
| `strategy.json` | Current execution strategy |
| `autonomous_state.json` | Loop state + improvement history |
| `heal_log.json` | Subsystem repair history |
