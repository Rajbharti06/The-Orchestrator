---
name: continuous-learning-v2
description: Instinct-based learning with confidence scoring — extracts patterns from every build automatically
version: 2.0.0
triggers: [learn, instinct, pattern, improve, memory, lesson]
tags: [learning, instincts, memory, improvement]
---

# Continuous Learning v2

Orchestrator X learns from every build automatically. Three parallel learning systems:

## 1. Lesson Store (Failure Patterns)

When a build fails or QA catches an issue, the system records:
- **Issue**: What went wrong
- **Cause**: Root cause
- **Fix**: How to avoid it
- **Stack**: Which tech stack context

These are injected into future agent prompts to prevent repeating mistakes.

```bash
# Add a manual lesson
orchestrator learn --issue "Missing CORS in FastAPI" --fix "Add CORSMiddleware to main.py" --stack fastapi

# API
POST /lessons
{ "issue": "...", "cause": "...", "fix": "..." }

# View all lessons
GET /lessons
```

## 2. Instinct Store (Confidence-Scored Patterns)

Instincts are lightweight patterns with Bayesian confidence scores (0-1).
- Start at 0.5 when first seen
- Rise toward 1.0 on successful use (+0.15 per success)
- Fall toward 0 on failure (-0.20 per failure)
- Pruned if confidence < 0.2 and age > 30 days
- Graduate to skills when confidence >= 0.85 and uses >= 5

```bash
# View instincts
GET /instincts

# Prune low-confidence instincts
POST /instincts/prune

# Evolve high-confidence instincts into skills
POST /instincts/evolve
```

## 3. Success Learner (Positive Patterns)

Records what worked well and elevates high-performing patterns:
- Builds scoring >= 90 → directly creates instinct (confidence: 0.6)
- Patterns seen 2+ times with score >= 80 → elevated instinct (confidence up to 0.9)

## Autonomous Learning Loop

The autonomous loop runs every 10 minutes (configurable):
1. Runs 8-test eval suite
2. Analyzes failures to extract lessons
3. Updates instinct confidence based on results
4. Prunes expired patterns
5. Reports score trend (improving/stable/declining)

```bash
# Start loop
POST /autonomous/start
{ "intervalMs": 600000 }

# Status
GET /autonomous/status

# Manual cycle
POST /autonomous/run-cycle
```

## Memory Persistence

All learning is persisted to `memory/`:
- `lessons.json` — failure patterns
- `instincts.json` — confidence-scored patterns
- `successes.json` — success patterns
- `history.json` — build history
- `providers.json` — LLM provider scoring

Memory survives restarts and improves across sessions.
