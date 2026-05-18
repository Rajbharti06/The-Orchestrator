---
name: search-first
description: Research-before-code pattern — always search for up-to-date docs and solutions before implementing
version: 1.0.0
triggers: [research, search, docs, documentation, latest, current, version]
tags: [research, search, documentation]
---

# Search First Skill

Never code from stale knowledge. Always verify current API signatures, package versions, and patterns before implementing.

## The Search-First Pattern

```
1. SEARCH: Find current docs/examples for the specific API/framework
2. VERIFY: Check version compatibility (package.json, requirements.txt)
3. UNDERSTAND: Read the actual current API surface
4. IMPLEMENT: Write code against verified, current patterns
5. VALIDATE: Test that it actually works
```

## When to Apply This Skill

- Using any npm/pip package (APIs change between major versions)
- FastAPI security dependencies (changed significantly in v0.100+)
- React hooks patterns (evolving rapidly)
- Database connection strings (credentials format varies)
- OAuth2/JWT libraries (security-critical, must use current patterns)
- Framework-specific config (breaking changes common)

## Web Search Agent

Orchestrator X's `webSearchAgent.js` handles this automatically:
- Triggered when Fix Agent encounters an unknown error
- Searches for solutions using LLM knowledge
- Returns cause, solution, and specific code change
- Feeds results back to Fix Agent
- Writes high-confidence solutions as lessons

## Manual Research Flow

For Claude Code sessions:
```
1. /search-first "FastAPI OAuth2PasswordBearer current pattern"
2. Read docs URL provided
3. Implement against current API
4. Test immediately
```

## Common Search Triggers

- "ImportError: cannot import name X from Y" → package API changed
- "422 Unprocessable Entity" → Pydantic model changed
- "TypeError: X is not a function" → library update broke API
- "DeprecationWarning" → migrate to new API before it breaks
