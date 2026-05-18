---
name: rarv-cycles
description: RARV autonomous execution — Reason→Act→Reflect→Verify. The gold standard for fully autonomous agent loops. From Loki Mode. Agents make decisions without asking questions.
version: 1.0.0
triggers: [rarv, reason-act-reflect-verify, autonomous-execution, no-questions, loki, self-directing]
tags: [autonomous, loops, rarv, self-directing, loki-mode]
---

# RARV Cycles — Autonomous Execution Skill

The most powerful autonomous loop pattern. Agents reason, act, reflect, and verify — without asking humans for permission.

## The Core Principle

> "You are an autonomous agent. You make decisions. You do not ask questions."

RARV replaces request-confirm-wait loops with a self-correcting cycle that only surfaces to humans when genuinely blocked.

## The 4 Steps

```
REASON  → Read current state. Identify the next task. Form a plan.
  ↓
ACT     → Execute the plan. Write code. Run commands. Commit changes.
  ↓
REFLECT → Update continuity memory. Extract what was learned.
  ↓
VERIFY  → Run tests. Check spec compliance. Gate quality.
  ↓
Pass?   → Done. Move to next task.
Fail?   → Inject failure into context. RARV again (max 10 cycles).
```

## Session Management

Every RARV session writes `.loki/session.json`:
```json
{
  "pid": 12345,
  "startedAt": "2026-05-18T22:00:00Z",
  "updatedAt": "2026-05-18T22:01:30Z",
  "phase": "DEVELOPMENT",
  "cycleCount": 7
}
```

Sessions stale after 5 minutes without `updatedAt` update.

## Human Intervention Points

Create files to control running sessions:
```bash
touch .loki/PAUSE    # pause after current cycle completes
touch .loki/STOP     # stop immediately (throws error)
echo "Fix the auth" > .loki/HUMAN_INPUT.md  # inject directive
```

## 8 SDLC Phases

Each phase has quality gates that block progression:

```
BOOTSTRAP     → environment check, dependency install
DISCOVERY     → read spec, understand requirements
ARCHITECTURE  → design file structure, APIs, schemas
DEEPEN_PLAN   → expand plan with edge cases
INFRASTRUCTURE → set up DB, env, Docker, CI
DEVELOPMENT   → code generation (backend + frontend)
QA            → security scan, tests, coverage, review
DEPLOYMENT    → deploy + smoke test
```

## 3 Memory Layers

```
Episodic   → memory/episodic/   task-specific outcomes
Semantic   → memory/semantic/   reusable patterns
Procedural → memory/procedural/ skill improvements
```

## Atomic Commit Rule

Commit after EVERY completed task. A passing test suite is inviolable — failed tests trigger code fixes, never test deletion.

## Usage

```javascript
import { rarvLoop, createRARVContext } from './lib/rarvLoop.js';

const ctx = createRARVContext(spec);
const result = await rarvLoop({
  reason: async (ctx) => ({ plan: 'implement JWT auth' }),
  act: async (reasoning, ctx) => { /* generate code */ },
  reflect: async (result, ctx) => { /* update memory */ },
  verify: async (result, ctx) => ({ passed: testsPassed }),
  context: ctx,
  maxCycles: 10,
});
```
