---
name: anti-sycophancy
description: Blind review system that prevents agents from agreeing with each other. 3 independent reviewers see code without seeing each other's verdicts. Requires 2/3 consensus. Also detects mutation-safe tests and backward compat.
version: 1.0.0
triggers: [anti-sycophancy, blind-review, independent-review, mutation-test, consensus, sycophancy]
tags: [quality, review, anti-sycophancy, consensus, blind, independence]
---

# Anti-Sycophancy Skill

The most insidious failure mode: agents that agree with each other even when they're wrong.

## The Problem

Without anti-sycophancy measures, agents:
- Approve code they've seen others approve (social proof)
- Give positive feedback because previous feedback was positive
- Skip issues they assume others caught
- Escalate confidence beyond evidence

## Blind Review Protocol

All 3 reviewers get code **with zero knowledge of other reviews**:

```javascript
import { blindReview, consensusGate } from './lib/antiSycophancy.js';

const reviews = await blindReview(code, context, [
  'code-reviewer',
  'security-reviewer',
  'database-reviewer',
]);

const verdict = await consensusGate(reviews, 0.66); // requires 2/3
// { approved: true|false, agreement: 0.85, dissent: [...] }
```

## Consensus Gate

```
2/3 reviewers approve → APPROVED
1/3 reviewers approve → BLOCKED (show all dissent to builder)
0/3 reviewers approve → HARD BLOCK (escalate)
```

## Anti-Sycophancy Score

Measures review independence (higher = better):
- 0.0 — all reviews identical (pure sycophancy)
- 0.5 — some variation, possibly independent
- 1.0 — genuinely diverse reviews (best signal)

Score < 0.3 → warn: reviews may be sycophantic, consider re-running.

## Mutation Detection

Do your tests actually catch bugs?

```javascript
import { mutationDetect } from './lib/antiSycophancy.js';

const result = await mutationDetect(code, tests);
// { mutationSafe: true, weakTests: ['auth.test.js:45'] }
```

The LLM imagines a broken version of the code and checks if tests would catch it. Tests that pass even for broken code are flagged as weak.

## Backward Compatibility Check

```javascript
import { backwardCompatCheck } from './lib/antiSycophancy.js';

const check = await backwardCompatCheck(oldAPI, newAPI);
// { compatible: false, breaking: ['removed: POST /users body.role'] }
```

## Documentation Coverage

Every exported function needs JSDoc:
```javascript
import { documentationCoverage } from './lib/antiSycophancy.js';

const coverage = await documentationCoverage(files);
// { covered: 0.92, missing: ['lib/ragEngine.js:retrieve'] }
```

## 11 Quality Gates (Expanded from 6)

| Gate | Blocks? | New? |
|------|---------|------|
| Security scan (OWASP) | YES | No |
| Import validation | YES | No |
| API contract compliance | YES | No |
| Error handling | YES | No |
| Env var documentation | Warn | No |
| Complexity | Warn | No |
| Mutation safety | YES | **New** |
| Backward compatibility | YES | **New** |
| Documentation coverage | Warn | **New** |
| Anti-sycophancy score | Warn | **New** |
| Blind review consensus | YES | **New** |
