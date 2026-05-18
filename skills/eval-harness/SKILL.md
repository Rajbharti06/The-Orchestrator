---
name: eval-harness
description: Self-scoring evaluation suite — 8 test cases covering the full pipeline. Measures quality trends, identifies weak areas, and drives autonomous self-improvement cycles.
version: 1.0.0
triggers: [eval, evaluation, self-score, benchmark, test-pipeline, quality-trend]
tags: [eval, self-improvement, quality, benchmark, autonomous]
---

# Eval Harness Skill

The system scores itself. Weak areas become lessons. Lessons become instincts. Instincts become skills.

## The 8 Eval Cases

| ID | Test Case | Measures |
|----|-----------|----------|
| `hello-api` | Simple Express GET endpoint | Basic code generation quality |
| `jwt-auth` | FastAPI JWT authentication | Auth pattern accuracy |
| `react-form` | React form with validation | Frontend component quality |
| `crud-api` | Full CRUD with DB schema | Architecture coherence |
| `stack-detection` | Mixed prompt → stack selection | Planning intelligence |
| `security-review` | Code with OWASP issues | Security scanner accuracy |
| `db-schema` | E-commerce schema design | Database reviewer quality |
| `deployment-plan` | Deploy config generation | Deployment pattern accuracy |

## Scoring Rubric

Each case is scored 0–100:

| Score | Meaning |
|-------|---------|
| 90–100 | Excellent — production ready |
| 75–89 | Good — minor improvements possible |
| 60–74 | Acceptable — some patterns missing |
| 40–59 | Poor — significant gaps |
| 0–39 | Failing — fundamental issues |

**Suite score** = weighted average (security × 1.5, others × 1.0)

**Pass threshold:** Suite score ≥ 60

## Trend Analysis

```javascript
// Trend detection across last 5 eval runs
function getTrend(history) {
  if (history.length < 3) return 'insufficient-data';
  const recent = history.slice(-3).map(r => r.score);
  const delta = recent[2] - recent[0];
  if (delta > 5) return 'improving';
  if (delta < -5) return 'declining';
  return 'stable';
}
```

## Failure → Lesson Pipeline

When a case fails:
```javascript
const failure = evalResults.cases.filter(c => c.score < 60);
failure.forEach(f => lessonStore.addLesson({
  issue: `Eval case '${f.id}' failed: ${f.reason}`,
  fix: f.expectedPattern,
  stack: f.stack,
  tags: ['eval', 'auto', f.id],
}));
```

## Autonomous Improvement Loop

Every 10 minutes (when enabled):
1. Run eval suite (8 cases)
2. Score outputs (0–100 per case)
3. Analyze failures → add lessons
4. Update instinct confidence scores
5. Prune expired/low-confidence instincts
6. If suite score improved → graduate top instinct to skill

## Running the Eval

```bash
# Full eval with API (requires keys)
npm run eval

# Mock eval (no API keys needed)
npm run eval:mock

# Via API
curl -X POST http://localhost:3000/eval

# Via CLI
node cli.js eval --mock
```

## Weak Area Detection

```javascript
function getWeakAreas(history) {
  const caseScores = {};
  history.forEach(run => {
    run.cases.forEach(c => {
      caseScores[c.id] = caseScores[c.id] || [];
      caseScores[c.id].push(c.score);
    });
  });
  
  return Object.entries(caseScores)
    .map(([id, scores]) => ({ id, avgScore: scores.reduce((a,b)=>a+b)/scores.length }))
    .filter(c => c.avgScore < 65)
    .sort((a, b) => a.avgScore - b.avgScore);
}
```
