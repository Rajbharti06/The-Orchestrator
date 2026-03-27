# The Orchestrator

A multi-agent system that transforms natural language prompts into fully functional applications.

## Overview

The Orchestrator is designed to move beyond single-response code generation. It coordinates multiple specialized agents to plan, build, verify, and deploy software systems from a single input prompt.

Instead of producing isolated code snippets, the system executes a structured workflow:

- Interprets the user’s intent
- Breaks it into executable tasks
- Generates backend and frontend components
- Verifies and fixes issues
- Prepares the project for deployment and version control

The result is a working application, not just generated code.

## Architecture

The system is built around a modular, agent-based architecture:

- **Planner Agent**  
  Analyzes the prompt and generates a structured execution plan
- **Backend Agent**  
  Builds APIs, authentication, and server-side logic
- **UI Agent**  
  Generates frontend interfaces aligned with backend endpoints
- **QA Agent**  
  Audits the generated codebase and identifies issues
- **Fix Loop**  
  Iteratively resolves errors detected during QA
- **GitHub Agent**  
  Initializes and commits the project to a repository
- **Deploy Agent**  
  Handles deployment with support for multiple hosting providers
- **Orchestrator Core**  
  Manages execution flow, shared context, and inter-agent communication

## Key Features

- Multi-agent orchestration with dependency-aware execution
- Shared context between agents to ensure consistency
- Self-correction loop with automated QA and fixes
- Provider-agnostic LLM support (OpenRouter, Groq, local models)
- Hosting flexibility (Vercel, Railway, Render, or custom)
- Real-time execution logs via Server-Sent Events
- Web-based dashboard for prompt execution and monitoring
- Mock mode for local development without API usage

## System Flow

1. User submits a prompt  
2. Planner generates a task sequence  
3. Backend agent executes first and defines core structure  
4. UI agent builds interface using shared context  
5. QA agent audits the generated code  
6. Fix loop resolves detected issues  
7. Code is committed to a repository  
8. Application is prepared for deployment

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

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
```

The system is provider-agnostic. You can use OpenRouter, Groq, or a local model.

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

This simulates agent outputs and allows testing of the orchestration pipeline.

## Design Principles

- Deterministic orchestration over one-shot generation
- Clear separation of responsibilities across agents
- Fail-safe execution with fallback mechanisms
- Provider and hosting independence
- Observable execution through structured logging

## Limitations

- Quality depends on the selected model/provider
- Deployment integrations may require additional setup
- Some complex applications may require iterative prompts

## Roadmap

- Smarter planning with task prioritization
- Improved dependency detection and installation
- Advanced deployment strategies with automatic fallback
- Persistent project memory across runs
- Plugin system for custom agents

## License

MIT License

## Author

Raj Bharti

