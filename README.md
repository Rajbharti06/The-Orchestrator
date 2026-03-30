# The Orchestrator

An autonomous system that builds, tests, and verifies software end-to-end.

## Overview

The Orchestrator is designed to move beyond single-response code generation. It coordinates multiple specialized agents to plan, build, verify, and deliver software systems from a single input prompt.

Instead of producing isolated code snippets, the system executes a structured, end-to-end workflow:

- **Interprets** the user’s intent
- **Breaks** it into prioritized, executable tasks
- **Generates** backend and frontend components
- **Enforces** a shared contract between system components
- **Runs** the application and performs real API testing
- **Validates** data flow and response structures
- **Automatically fixes** issues through an iterative repair loop
- **Prepares** the project for deployment and version control

The system does not assume correctness. It verifies it.

The result is not just generated code, but a working, validated application.

## Architecture

The system is built around a modular, agent-based architecture:

- **Planner Agent**  
  Analyzes the prompt and generates a structured execution plan with semantic requirements and schemas.
- **Backend Agent**  
  Builds APIs, authentication, and server-side logic using FastAPI (Python) or Node.js.
- **UI Agent**  
  Generates frontend interfaces (React/JSX) aligned with backend endpoints and shared contracts.
- **QA Agent**  
  Audits the generated codebase and identifies structural or logic issues.
- **Fix Agent**  
  Iteratively resolves errors detected during QA or runtime validation.
- **Runtime API Tester**
  Executes real HTTP calls against the live running backend to verify data flow and endpoint behavior.
- **Orchestrator Core**  
  Manages execution flow, shared context, and inter-agent communication while enforcing system-wide constraints.

## Key Features

- **Multi-Agent Orchestration**: Dependency-aware execution with specialized agents.
- **Shared Contract Enforcement**: Guarantees alignment between UI and Backend API layers.
- **Runtime Reality Validation**: Live API testing with schema-based request/response verification.
- **Self-Healing Loop**: Automated fix-and-retry logic for QA and runtime failures.
- **Memory-Driven Learning**: System remembers past failure points to prioritize validation in future runs.
- **Provider-Agnostic LLM Routing**: Intelligent fallback across OpenAI, Groq, OpenRouter, and local models.
- **Secure Permission System**: Enforced scopes for agent actions like Git push and Deployment.
- **Real-time Observability**: Execution logs via Server-Sent Events (SSE) and web dashboard.

## System Flow

1. **User submits a prompt**  
2. **Planner generates a task sequence** with defined API schemas and requirements.
3. **Backend agent executes** and defines the core system structure.
4. **UI agent builds interface** using the shared API contract.
5. **Orchestrator enforces alignment** between layers.
6. **Runtime validation** starts the app and performs live API testing.
7. **Fix loop resolves** any structural or runtime issues detected.
8. **Application is finalized** and prepared for deployment.

"Correctness is no longer guessed. It is enforced."

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm
- Python (for FastAPI backends)

### Installation

```bash
git clone https://github.com/Rajbharti06/The-Orchestrator.git
cd The-Orchestrator
npm install
```

### Environment Setup

Create a `.env` file:

```env
MODEL_NAME=your_model
OPENAI_BASE_URL=your_provider_url
OPENAI_API_KEY=your_key
MOCK=false
SAFE_MODE=true
```

The system is provider-agnostic. You can use OpenAI, Groq, OpenRouter, or a local model. Enable `SAFE_MODE=true` for deterministic provider routing during demos.

## Running the System

### CLI Mode

```bash
node orchestrator.js "build login system with dashboard"
```

### Dashboard Mode

Start the server:

```bash
npm run orchestrator:server
```

Then open:

```
frontend/index.html
```

## API Endpoints

- `POST /build`  
  Starts a new orchestration run
- `GET /logs`  
  Streams real-time execution logs via SSE

## Development Mode

Enable mock mode to run without external APIs:

```env
MOCK=true
```

This simulates agent outputs while keeping the **Runtime API Tester** and **Validation** phases real—proving the system's ability to verify its own output.

## Design Principles

- **Verification over Generation**: The system doesn't trust the code it generates; it proves it works.
- **Semantic Contract Enforcement**: Ensuring different layers of the app speak the same language.
- **Safe Automation**: Permission-scoped agent actions and secure environment handling.
- **Fail-safe Execution**: Robust fallback mechanisms and iterative self-repair.

## Limitations

- Quality depends on the selected model/provider.
- Free-tier LLM rate limits may require `SAFE_MODE` or per-task delays.
- Complex data persistence setups may require iterative prompts.

## Roadmap

- Smarter planning with prioritized requirement boosting.
- Advanced Auth0 Token Vault integration for agent-to-API security.
- End-to-end user flow simulation (frontend + backend testing).
- Persistent project memory across multi-session runs.

## License

MIT License

## Author

Raj Bharti

