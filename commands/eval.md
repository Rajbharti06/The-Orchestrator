---
name: eval
description: Run the self-scoring evaluation suite to measure system intelligence
---

# /eval

Run the Orchestrator X 8-case evaluation suite. Measures the quality of LLM responses across key task types.

## Usage

```
/eval
/eval --mock
```

## Eval Cases

| ID | Name | Task Type | Weight |
|----|------|-----------|--------|
| hello-api | Hello World API | coding | 1x |
| jwt-auth | JWT Authentication | coding | 2x |
| react-form | React Form | coding | 1x |
| crud-api | CRUD API | coding | 2x |
| stack-detection | Stack Detection | planning | 2x |
| security-review | Security Review | qa | 2x |
| db-schema | Database Schema | planning | 1x |
| deployment-plan | Deployment Plan | planning | 1x |

## Scoring

Each case is scored 0-100 based on:
- Pattern matching (80 points) — does output contain expected keywords?
- Output length (20 points) — is the response substantive?

Overall score is weighted by case complexity.

## Output

```
Eval complete — Score: 83/100
Trend: improving

Results:
  ✓ Hello World API: 88/100
  ✓ JWT Authentication: 91/100
  ✗ React Form: 55/100 (low pattern match)
  ✓ CRUD API: 82/100
  ✓ Stack Detection: 87/100
  ✓ Security Review: 79/100
  ✗ Database Schema: 48/100 (missing CREATE TABLE)
  ✓ Deployment Plan: 88/100

Weak areas: React Form (avg: 55), Database Schema (avg: 48)
```

## Autonomous Mode

When autonomous loop is running, eval runs automatically every 10 minutes.
Failures generate lessons. Score history tracked over time.
