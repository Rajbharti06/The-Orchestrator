---
description: Manually teach the orchestrator a lesson — add a failure pattern with its fix to the lesson store for injection into future builds.
argument-hint: "[issue description]"
---

# /learn — Teach a Lesson

Add a lesson to the orchestrator's lesson store. Future builds will receive this knowledge in their system prompts.

**Usage:**
```
/learn FastAPI fails to start when SECRET_KEY is not set in environment
/learn React hooks must be called at the top level, never inside conditionals
/learn PostgreSQL requires pg_trgm extension for ILIKE on large tables
```

**The lesson will be:**
- Stored in `memory/lessons.json`
- Tagged by stack (auto-detected or manual)
- Injected into relevant future agent prompts
- Scored for relevance via cosine similarity

**To view all lessons:** `/instinct-status`
**To add via API:** `POST /lessons { "issue": "...", "fix": "..." }`
