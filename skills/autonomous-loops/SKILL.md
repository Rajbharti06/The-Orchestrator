---
name: autonomous-loops
description: Self-improvement loop patterns — eval → learn → improve cycles running without human input
version: 2.0.0
triggers: [autonomous, loop, self-improve, auto, cycle, background]
tags: [autonomous, loop, learning, improvement]
---

# Autonomous Loops Skill

Orchestrator X can run self-improvement cycles without any human input.

## How It Works

```
Every 10 minutes:
┌─────────────────────────────────────────────────────┐
│ 1. RUN EVAL SUITE (8 test cases against real LLM)  │
│    Planning, Coding, QA, Stack Detection tests     │
│                                                    │
│ 2. ANALYZE FAILURES                                │
│    Extract cause + fix for each failed case        │
│                                                    │
│ 3. WRITE LESSONS                                   │
│    Failed cases → lessonStore.addLesson()          │
│                                                    │
│ 4. UPDATE INSTINCT CONFIDENCE                      │
│    Weak areas → reduce confidence for related      │
│    instincts (Bayesian update)                     │
│                                                    │
│ 5. PRUNE EXPIRED PATTERNS                          │
│    Remove instincts < 0.2 confidence + 30 days old │
│                                                    │
│ 6. TRACK SCORE HISTORY                             │
│    Record score, trend, lessons added              │
└─────────────────────────────────────────────────────┘
```

## Configuration

```bash
# Start with default interval (10 min)
POST /autonomous/start

# Custom interval (5 min)
POST /autonomous/start
{ "intervalMs": 300000 }

# Environment variable
ENABLE_AUTONOMOUS_LOOP=true npm start
```

## Score Interpretation

| Score | Interpretation | Action |
|-------|---------------|--------|
| 80-100 | Excellent | Maintain current patterns |
| 65-79 | Good | Minor improvements needed |
| 50-64 | Fair | Investigate weak areas |
| < 50 | Poor | Review lessons and instincts |

## Trend Detection

After 3+ eval cycles, the system detects trends:
- **Improving** (+3 points vs previous average) → current approach is working
- **Declining** (-3 points vs previous average) → lessons may be stale or conflicting
- **Stable** → system has reached equilibrium

## Self-Improvement Mechanics

The system improves its **memory** (lessons + instincts), not its source code:
- Safe: no risk of breaking changes
- Measurable: track score history in dashboard
- Reversible: lessons can be manually deleted
- Transparent: all changes visible in `/lessons` and `/instincts`
