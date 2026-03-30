# The Orchestrator

An autonomous system that builds, tests, and verifies software from a single prompt.

---

## What It Does

Most AI tools generate code and stop there. The Orchestrator goes further. It takes a natural language prompt, breaks it into structured tasks, builds the backend and frontend, starts the application, and makes real HTTP calls to verify that the software actually works before it is delivered.

The system does not assume correctness. It proves it.

---

## How It Works

When you run a prompt, the system moves through a fixed sequence of stages:

1. The planner reads the prompt and produces a structured task list with defined API schemas and requirements.
2. Specialized agents execute those tasks in order. The backend agent runs first and establishes the API contract. The UI agent uses that contract to build aligned frontend code.
3. The orchestrator checks that both layers are using the same endpoints and data structures.
4. The application is started. Real HTTP requests are sent to the live server.
5. If a request fails or a response is malformed, a fix agent rewrites the relevant code and the test runs again.
6. Once validation passes, the project is committed and prepared for deployment.

---

## Architecture

The system is built around a set of specialized agents that communicate through a shared context object:

**Planner Agent**
Converts a natural language prompt into a prioritized task list with endpoint requirements and response schemas. The planner uses domain awareness to inject security and structural requirements based on the type of application being built.

**Backend Agent**
Generates server-side code one file at a time. Each task produces a single file, which prevents token overflow and keeps outputs focused. Currently targets FastAPI (Python).

**UI Agent**
Generates frontend components using React and JSX. The agent receives the shared API contract from the backend agent so it calls the correct endpoints.

**QA Agent**
Performs a structural audit of the generated files before they are written to disk. Can be skipped in environments with strict rate limits.

**Fix Agent**
Takes specific failure descriptions from QA or runtime testing and rewrites the affected files. Runs in a loop with a retry cap.

**Runtime API Tester**
Starts the generated backend using uvicorn and sends real HTTP requests to each planned endpoint. Validates that the server responds and that responses contain the expected fields.

**Orchestrator Core**
Coordinates the full pipeline, passes shared context between agents, enforces stack consistency, and manages fallback behavior.

---

## Key Behaviors

**Shared contract enforcement**
The system extracts the API endpoints defined in the backend and checks that the frontend references the same paths. If there is a mismatch, the fix agent is called before the pipeline continues.

**Self-healing loop**
Runtime failures produce a specific error description that is passed directly to the fix agent. The agent rewrites the code, the server restarts, and the API tests run again. This repeats up to three times before the system stops and reports the failure.

**Provider-agnostic routing**
LLM calls are routed through a layered fallback system. You can configure any combination of OpenAI, Groq, OpenRouter, or a local Ollama instance. The router selects providers based on task type and falls back automatically on failure.

**Memory across runs**
The system records which requirements failed and boosts their priority on subsequent runs, so known failure patterns are treated as hard constraints rather than suggestions.

---

## Getting Started

**Requirements**
- Node.js v18 or higher
- Python 3.9 or higher
- npm

**Installation**

```bash
git clone https://github.com/Rajbharti06/The-Orchestrator.git
cd The-Orchestrator
npm install
```

**Environment**

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

At minimum, set one LLM provider key. The system will route through whatever is available.

---

## Running the System

**Basic usage**

```bash
node orchestrator.js "build login system with dashboard"
```

**Stable demo mode**

```bash
$env:MOCK="true"; $env:SKIP_QA="true"; node orchestrator.js "build auth system with register, login, JWT and protected route"
```

In mock mode, file generation uses deterministic outputs. The runtime validation phase still runs against a live server, so the API testing is real even when generation is mocked.

**Dashboard**

```bash
npm run orchestrator:server
```

Then open `frontend/index.html` in a browser. The dashboard streams live execution logs via Server-Sent Events and shows the build, test, and deployment status as the pipeline runs.

---

## API Endpoints

`POST /build` — Starts an orchestration run with the provided prompt.

`GET /logs` — Streams execution events in real time using SSE.

---

## Design Decisions

**One file per agent call**
Early versions asked the LLM to generate all files in a single response. This caused JSON truncation errors on every provider tested. The current design requests one file per task, which keeps responses small and parseable regardless of the provider.

**Stack enforcement**
The system rejects files that do not match the configured stack. A Python backend task cannot produce a Node.js file. This prevents agents from drifting between frameworks across tasks.

**422 is a passing test**
When the runtime tester sends a POST request with placeholder credentials, FastAPI returns 422 Unprocessable Entity. This is treated as a pass. It proves the server is running, the route exists, and request validation is working. A 404 means the route is missing. A 500 means the server crashed.

---

## Limitations

- Free-tier LLM rate limits will interrupt multi-task pipelines. Use SAFE_MODE and per-task delays, or use a provider with higher throughput.
- Generated code quality depends on the model. Smaller models may produce structurally valid but logically incomplete implementations.
- The runtime tester sends simple test payloads. It does not simulate authenticated sessions or multi-step user flows.

---

## Roadmap

- End-to-end user flow simulation across register, login, and authenticated routes
- Frontend runtime testing alongside the backend validation
- Persistent project memory across sessions
- Deployment to Vercel and Railway with automatic URL capture

---

## License

MIT

## Author

Raj Bharti
