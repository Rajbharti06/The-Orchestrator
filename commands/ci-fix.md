---
name: ci-fix
description: Monitor CI/CD pipelines and autonomously fix failures. Watches GitHub Actions, GitLab CI, or CircleCI. On failure, extracts root cause, patches code, and re-runs until green or max attempts reached.
triggers: [/ci-fix]
---

# /ci-fix — Autonomous CI Fix Command

Watch your CI pipeline. Fix failures automatically. Ship green.

## Usage

```bash
/ci-fix                          # Monitor latest CI run
/ci-fix --run <run-id>           # Monitor specific run
/ci-fix --provider gitlab        # Specify CI provider
/ci-fix --max-attempts 5         # Max repair attempts (default: 3)
/ci-fix --watch                  # Keep watching after fix
```

## Supported Providers

| Provider | Auto-detection | Log Parsing |
|----------|---------------|-------------|
| GitHub Actions | `gh run list` | Full log extraction |
| GitLab CI | `.gitlab-ci.yml` present | `/api/v4/pipelines` |
| CircleCI | `.circleci/config.yml` | CircleCI API v2 |
| Local `npm test` | package.json scripts | stdout/stderr |

## Failure Types Handled

| Type | Detection | Fix Strategy |
|------|-----------|--------------|
| `LINT` | eslint/ruff errors | Auto-format + fix rules |
| `TEST` | jest/pytest failures | Fix assertion + logic |
| `BUILD` | tsc/webpack errors | Fix types + imports |
| `SECURITY` | npm audit / snyk | Update deps + patch |
| `DEPLOY` | infra/container | Fix config + retry |
| `TIMEOUT` | job > time limit | Optimize + parallelize |

## Auto-Fix Loop

```
CI fails
  → Parse logs → classify failure type
  → Extract: file + line + error message
  → fixAgent patches code
  → Commit: "fix(ci): resolve [failure-type] — attempt N"
  → Wait for CI re-run
  → Repeat up to max-attempts

If max-attempts reached:
  → Write .loki/HUMAN_INPUT.md with full diagnosis
  → Notify: "CI auto-fix exhausted — human required"
```

## Output

```
Monitoring: GitHub Actions run #1847
Status: FAILED (attempt 1/3)

Failure: TEST
Files: src/auth/jwt.test.ts:45
Error: "Expected token to expire in 3600s, got 7200s"

Applying fix...
  → Updated JWT_EXPIRY from 7200 to 3600 in lib/auth.js
  → Committed: fix(ci): resolve TEST failure jwt expiry — attempt 1

Waiting for CI re-run...
Status: PASSED ✓

Total: 1 fix in 2m 14s
```
