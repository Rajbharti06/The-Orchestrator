---
description: Run end-to-end tests with screenshots at 3 viewports, performance metrics (LCP/INP/CLS), and accessibility audit.
argument-hint: "[url or leave empty to use last build]"
---

# /e2e — End-to-End Testing

Run full E2E test suite with Playwright against the running application.

**What runs:**
1. E2E tests for all user-facing flows
2. Screenshots at mobile (375px), tablet (768px), desktop (1920px)
3. Performance audit (LCP, INP, CLS, FCP thresholds)
4. Accessibility scan (WCAG 2.1 AA)
5. Console error detection

**Pass/Fail Thresholds:**
- LCP ≤ 4s (fail if exceeded)
- CLS ≤ 0.25 (fail if exceeded)
- Zero E2E test failures
- Zero uncaught console errors

**Usage:**
```
/e2e
/e2e http://localhost:3000
```

**Reports saved to:** `reports/v[VERSION]/05-tester-report.md`
