---
description: Comprehensive code review — correctness, performance, security, maintainability, and test coverage. Reviews the current working tree or a specific file/directory.
argument-hint: "[file or directory path, or leave empty for full working tree]"
---

# /code-review — Code Review

Activate @code-reviewer agent to perform a thorough review.

**Checks:**
- Correctness: edge cases, error paths, race conditions
- Performance: N+1 queries, blocking I/O, memory leaks
- Security: input validation, auth checks, injection vectors
- Maintainability: function size, complexity, DRY violations
- Testing: coverage gaps, test quality

**Output:**
- Overall verdict: APPROVED / APPROVED WITH COMMENTS / CHANGES REQUIRED
- Critical issues (must fix before merge)
- Warnings (should fix)
- Suggestions (optional improvements)
- Positives (what's done well)

**Usage:**
```
/code-review
/code-review src/auth/
/code-review src/api/users.ts
```
