---
description: Start a Test-Driven Development workflow — write failing tests first, then implement until they pass. Enforces 80% coverage and red-green-refactor discipline.
argument-hint: "[feature description]"
---

# /tdd — Test-Driven Development

Activate TDD mode for the described feature.

**Workflow:**
1. Load @tdd-guide agent
2. Write failing tests for all behaviors (happy + error paths)
3. Run tests — confirm red
4. Implement until green
5. Refactor
6. Report coverage (must be ≥80%)

**Usage:**
```
/tdd Add user authentication with JWT
/tdd CRUD endpoints for posts with pagination
```

**Rules:**
- No implementation code until failing tests exist
- Coverage check runs automatically at completion
- Failure to reach 80% coverage → add more tests before proceeding
