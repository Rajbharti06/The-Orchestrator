---
name: dream-memory
description: Background memory consolidation — runs dream cycles using cheaper models to compress, reflect, and journal agent experiences into structured knowledge graphs. Cross-session persistent intelligence.
version: 1.0.0
triggers: [dream, memory-consolidation, background-memory, reflection, journal, knowledge-graph]
tags: [memory, autonomous, background, learning, persistence]
---

# Dream Memory Skill

Agents learn while they "sleep." Dream cycles run in the background to consolidate experiences into reusable intelligence.

## Memory Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Memory Layers                        │
├────────────────┬────────────────┬────────────────────────┤
│  Episodic      │  Semantic      │  Procedural            │
│  (what happened)│ (what is true) │  (how to do it)       │
│  build history │  domain facts  │  lessons + instincts   │
│  session logs  │  stack knowlg. │  skills                │
└────────────────┴────────────────┴────────────────────────┘
```

## Dream Cycle Phases

### Phase 1: Episode Collection (5 min after session)
Gather raw events: build logs, QA reports, error messages, fix attempts.

### Phase 2: Reflection (dream model runs)
A cheaper model (haiku/ollama) analyzes episodes:
```javascript
const reflections = await dreamModel.analyze({
  episodes: recentBuilds,
  prompt: `Extract:
    1. What patterns led to success?
    2. What caused failures and why?
    3. What would you do differently?
    4. What general rules emerge?`
});
```

### Phase 3: Consolidation
Write reflections to memory:
- **Lessons**: Specific failure patterns with fixes
- **Instincts**: General rules with confidence scores
- **Skills**: High-confidence instinct clusters → new SKILL.md
- **Pruning**: Remove low-confidence memories (score < 0.3)

### Phase 4: Journal Entry
Record the dream cycle itself:
```markdown
## Dream Cycle 2026-05-18T02:00:00Z
- Episodes processed: 12
- New lessons extracted: 3
- Instincts updated: 7
- Skills graduated: 1 (fastapi-auth-patterns)
- Pruned: 2 (expired low-confidence entries)
```

## Configuration

```javascript
// dreamCycle.js config
{
  dreamModel: 'claude-haiku-4-5-20251001', // cheaper model for reflection
  schedule: '0 2 * * *',                   // run at 2 AM daily
  minEpisodes: 3,                          // minimum builds before dreaming
  reflectionDepth: 'standard',            // 'quick' | 'standard' | 'deep'
  graduationThreshold: 0.8,               // instinct confidence for skill graduation
  pruneThreshold: 0.3,                    // below this confidence, prune
  journalPath: 'memory/dreams.jsonl',
}
```

## Journaling Format

Every significant event gets a journal entry:
```json
{
  "timestamp": "2026-05-18T02:13:44Z",
  "type": "reflection",
  "summary": "FastAPI auth consistently fails when SECRET_KEY not set",
  "confidence": 0.92,
  "source_builds": ["build_abc", "build_def"],
  "action": "lesson_added"
}
```

## Cross-Session Persistence

Dream memories survive session restarts:
- `memory/lessons.json` — Failure patterns
- `memory/instincts.json` — Confidence-scored rules
- `memory/dreams.jsonl` — Dream journal
- `memory/skills/` — Graduated skills

On session start, hooks load the top lessons and instincts into the system prompt (see `scripts/hooks/session-start.js`).
