---
name: verification-loop
description: Quality gate verification loop — runs QA, validates contracts, and loops builder-fix cycles until the build meets quality standards. Prevents broken code from shipping.
version: 1.0.0
triggers: [verify, verification, quality-gate, qa-loop, fix-loop, build-verify]
tags: [quality, verification, loops, qa, fix]
---

# Verification Loop Skill

Never ship a build that hasn't passed all quality gates. Loop until it passes or exhausted.

## The Loop

```
┌─────────────────────────────────────────────┐
│             Verification Loop               │
│                                             │
│  Build → QA → Pass? ──YES──→ Ship          │
│              ↓                              │
│              NO                             │
│              ↓                              │
│         Web Search (if unknown error)       │
│              ↓                              │
│         Inject Lessons                      │
│              ↓                              │
│         Fix Agent (targeted repair)         │
│              ↓                              │
│         Back to QA (max 3 attempts)         │
└─────────────────────────────────────────────┘
```

## Quality Gate Checks

All 6 checks must pass:

| Check | Threshold | Blocker |
|-------|-----------|---------|
| Security scan | 0 critical/high issues | YES |
| Import validation | All imports resolve | YES |
| API contract compliance | All endpoints implemented | YES |
| Error handling | No bare `catch {}` | YES |
| Env var documentation | All vars in .env.example | NO (warn) |
| Complexity | Functions <50 lines | NO (warn) |

## Fix Prioritization

When fixing, address in order:
1. Security vulnerabilities (always first)
2. Import errors (app won't start)
3. Missing API endpoints (contract violation)
4. Error handling gaps
5. Style/complexity issues (last, or skip)

## Lesson Injection

Before each fix attempt, inject relevant lessons:
```javascript
const lessons = await lessonStore.getRelevantLessons({
  stack: plan.stack,
  issues: qaReport.critical,
  maxLessons: 5,
});
// Prepend to fix agent's system prompt
```

## Web Search on Unknown Errors

If QA finds errors not in lesson store:
```javascript
const solutions = await webSearchAgent.analyzeErrors(
  qaReport.critical.slice(0, 2),
  { stack: plan.stack }
);
// Store solutions as new lessons for future builds
```

## Verification Report

```markdown
## Verification Loop Summary

- Total attempts: N/3
- Final status: [PASSED | PARTIAL | FAILED]
- QA score: XX/100
- Issues resolved: N
- Issues remaining: N

### Per-Attempt Results
| Attempt | Score | Critical | High | Action Taken |
|---------|-------|----------|------|-------------|
| 1 | 62 | 2 | 3 | Fix applied |
| 2 | 85 | 0 | 1 | Fix applied |
| 3 | 94 | 0 | 0 | PASSED |
```
