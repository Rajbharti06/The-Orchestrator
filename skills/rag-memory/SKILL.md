---
name: rag-memory
description: 4-step RAG pipeline over the orchestrator's memory — RETRIEVE→JUDGE→DISTILL→CONSOLIDATE. Surfaces the most relevant lessons, instincts, and build history for any query in <50ms.
version: 1.0.0
triggers: [rag, retrieval, memory-search, retrieve-judge-distill, knowledge-retrieval]
tags: [rag, memory, retrieval, knowledge, search]
---

# RAG Memory Skill

Retrieve the right knowledge at the right time. 4 steps, no vector database required.

## The Pipeline

```
RETRIEVE  → TF-IDF scoring across all memory namespaces
    ↓
JUDGE     → LLM (haiku) scores each candidate's relevance (0-1)
    ↓
DISTILL   → Extract the core insight from top results
    ↓
CONSOLIDATE → Merge with existing knowledge (EWC-inspired: don't overwrite if new confidence < 0.7)
```

## Memory Namespaces

| Namespace | Source | Content |
|-----------|--------|---------|
| `lessons` | `memory/lessons.json` | Failure patterns + fixes |
| `instincts` | `memory/instincts.json` | Confidence-scored patterns |
| `builds` | `memory/history.json` | Build outcomes + stacks |
| `skills` | `skills/*/SKILL.md` | Domain knowledge |
| `episodic` | `memory/episodic/` | Task-specific outcomes |
| `semantic` | `memory/semantic/` | Reusable learned patterns |

## Usage

```javascript
import { ragQuery } from './lib/ragEngine.js';

const { context, sources, confidence } = await ragQuery(
  'FastAPI JWT authentication fails',
  { topK: 5, namespace: 'all' }
);

// context: "Known issue: SECRET_KEY must be set in env. Fix: export SECRET_KEY=$(openssl rand -hex 32)"
// sources: ['lessons:jwt-001', 'instincts:fastapi-auth-pattern']
// confidence: 0.87
```

## Elastic Weight Consolidation (EWC)

When new knowledge conflicts with existing high-confidence patterns:
- New confidence ≥ 0.7 → update (replace old)
- New confidence < 0.7 → preserve old, add as alternative
- Equal confidence → merge both (additive)

This prevents catastrophic forgetting of hard-won lessons.

## Performance

- RETRIEVE: <5ms (in-memory TF-IDF)
- JUDGE: ~500ms (LLM call, haiku model)
- DISTILL: ~300ms (LLM summarization)
- CONSOLIDATE: <10ms (merge logic)
- **Total: ~800ms per query**

## Automatic Injection

RAG context is automatically injected into agent prompts by `lib/promptEnhancer.js` when a query matches stored memory with confidence > 0.5.
