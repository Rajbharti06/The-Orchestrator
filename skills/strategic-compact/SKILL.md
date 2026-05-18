---
name: strategic-compact
description: Goal decomposition and dependency graph generation. Breaks complex prompts into ordered phases with dependency tracking, complexity scoring, and parallel execution planning.
version: 1.0.0
triggers: [strategy, decompose, plan-phases, dependency-graph, strategic, complex-goal]
tags: [strategy, planning, decomposition, complexity]
---

# Strategic Compact Skill

Decompose any goal into an ordered execution plan before touching code.

## When to Use

- Prompt is >150 characters
- Prompt mentions 3+ distinct features
- Prompt involves multiple services (auth + API + UI + DB + deploy)
- Prompt says "full app", "complete system", "end-to-end"

## Decomposition Process

### 1. Complexity Assessment

```javascript
const signals = [
  /\b(auth|jwt|oauth)\b/i,     // auth complexity
  /\b(database|sql|postgres)\b/i, // data layer
  /\b(react|vue|next)\b/i,     // frontend
  /\b(deploy|docker|ci)\b/i,   // ops complexity
  /\b(realtime|websocket|ws)\b/i, // realtime
  /\b(test|tdd|coverage)\b/i,  // testing
];

const complexity = signals.filter(s => s.test(prompt)).length > 3
  ? 'high' : signals.filter(s => s.test(prompt)).length > 1
  ? 'medium' : 'low';
```

### 2. Phase Graph

Each phase has explicit dependencies:

```json
{
  "phases": [
    { "id": "strategy",  "deps": [],                    "parallel": false },
    { "id": "plan",      "deps": ["strategy"],           "parallel": false },
    { "id": "arch",      "deps": ["plan"],               "parallel": false },
    { "id": "backend",   "deps": ["arch"],               "parallel": true  },
    { "id": "frontend",  "deps": ["arch"],               "parallel": true  },
    { "id": "qa",        "deps": ["backend","frontend"], "parallel": false },
    { "id": "fix",       "deps": ["qa"],                 "parallel": false },
    { "id": "test",      "deps": ["fix"],                "parallel": false },
    { "id": "deploy",    "deps": ["test"],               "parallel": false }
  ]
}
```

### 3. Execution Plan Output

```markdown
## Strategy Report

**Complexity:** HIGH
**Estimated time:** 45 minutes
**Parallelizable phases:** backend + frontend

### Phase Breakdown
1. Strategy (this) — 2 min
2. Stack detection + planning — 5 min
3. Architecture design — 8 min
4. Backend + Frontend (parallel) — 15 min
5. QA audit + fix loop — 10 min
6. API testing — 3 min
7. Deploy config — 2 min

### Key Risks
- JWT implementation complexity → inject auth lessons
- React state management → use established patterns
- Database schema may require migration → plan backward compat

### Recommended Stack
- Backend: FastAPI (complexity justifies Python ecosystem)
- Frontend: React + Vite (fastest for prototyping)
- DB: PostgreSQL (ACID compliance for auth)
- Deploy: Railway (easiest for this stack)
```

## Compact Representation

For injection into agent prompts (condensed):
```
STRATEGY: complexity=HIGH | phases=9 | parallel=[backend,frontend]
RISKS: jwt_auth, react_state, db_schema
STACK: fastapi+react+postgres → railway
```
