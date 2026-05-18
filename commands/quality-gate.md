---
description: Run the full quality gate — security scan, import validation, API contract compliance, error handling audit, and complexity check. Reports pass/fail with details.
argument-hint: "[path to check, default: current working tree]"
---

# /quality-gate — Quality Verification

Run all quality checks against generated or existing code.

**6 Checks:**

| Check | Threshold | Blocks? |
|-------|-----------|---------|
| Security scan (OWASP Top 10) | 0 critical/high | YES |
| Import validation | All imports resolve | YES |
| API contract compliance | All endpoints in arch | YES |
| Error handling | No bare `catch {}` | YES |
| Env var documentation | Vars in .env.example | Warning |
| Complexity | Functions <50 lines | Warning |

**Overall Score:** 0–100 (≥80 to pass)

**Usage:**
```
/quality-gate
/quality-gate src/
/quality-gate --strict  (treat warnings as failures)
```

**Output:** Detailed report with file:line references for every issue found.
**API:** `POST /quality-gate` with `{ files: {...} }`
