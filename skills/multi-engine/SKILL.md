---
name: multi-engine
description: Multi-CLI runtime abstraction — run Claude Code, Codex, Gemini, Cursor Agent, OpenCode, or any custom CLI as interchangeable engines behind a unified API.
version: 1.0.0
triggers: [multi-engine, engine, codex, gemini, opencode, cursor-agent, cli-engine, switch-engine]
tags: [multi-engine, cli, runtime, abstraction]
---

# Multi-Engine Skill

Run any AI coding CLI as a swappable engine behind Orchestrator X's unified API.

## Supported Engines

| Engine ID | CLI | Notes |
|-----------|-----|-------|
| `claude` | Claude Code | Default, best tool use |
| `codex` | OpenAI Codex CLI | Strong Python/data tasks |
| `gemini` | Gemini CLI | Long context, multi-modal |
| `cursor` | Cursor Agent | IDE-native with diff view |
| `opencode` | OpenCode | Open-source Claude alternative |
| `custom` | Any subprocess CLI | Custom via adapter config |

## Engine Selection

Specify engine per build or set a default:

```javascript
// Per-build engine selection
const job = await startBuild(prompt, { engine: 'gemini' });

// Default engine in .env
ENGINE=codex

// Automatic selection based on task type
const engine = selectEngine({
  taskType: 'data-science',   // → 'codex'
  contextLength: 200_000,     // → 'gemini'
  hasUI: true,                // → 'claude'
  default: 'claude',
});
```

## Engine Adapter Interface

Every engine adapter implements the same interface:

```javascript
class EngineAdapter {
  async startSession(prompt, options) { ... }
  async sendMessage(sessionId, message) { ... }
  async getOutput(sessionId) { ... }
  async endSession(sessionId) { ... }
  
  // Engine capabilities
  get maxContextTokens() { return 200_000; }
  get supportsToolUse() { return true; }
  get supportsStreaming() { return true; }
}
```

## Task-to-Engine Routing

```javascript
const ENGINE_ROUTING = {
  planning:     'claude',   // Best reasoning
  architecture: 'claude',   // Best tool use + planning
  backend:      'claude',   // Best code generation
  frontend:     'claude',   // Best React/UI generation
  'data-science': 'codex',  // Specialized for Python/ML
  'long-context': 'gemini', // 1M token context
  research:     'claude',   // Best web search integration
  qa:           'claude',   // Best security analysis
};
```

## Custom Engine Registration

Register any CLI as a custom engine:

```javascript
// In lib/multiEngine.js
registerEngine('my-cli', {
  binary: 'my-coding-cli',
  flags: { prompt: '--prompt', output: '--output-json' },
  parseOutput: (stdout) => JSON.parse(stdout).files,
  capabilities: { maxContext: 100_000, toolUse: false },
});
```

## Fallback Chain

If the primary engine fails, automatically fall back:

```javascript
const FALLBACK_CHAIN = ['claude', 'gemini', 'codex', 'opencode'];
// On any engine error, try next in chain
```

## Cost Optimization

Route cheap tasks to cheaper engines:
- **Haiku-equivalent tasks** (commit messages, formatting): use `opencode` or local Ollama
- **Complex reasoning** (architecture, security): always `claude`
- **Bulk generation** (CRUD boilerplate): `codex` or `gemini`
