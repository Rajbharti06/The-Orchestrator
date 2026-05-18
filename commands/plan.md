---
description: Plan-only mode — decompose the goal into phases with dependency graph, complexity estimate, and stack recommendation. No code generated.
argument-hint: "[project description]"
---

# /plan — Strategic Planning

Decompose a complex goal into an ordered execution plan without generating code.

**Output:**
- Complexity assessment (low/medium/high)
- Ordered phase list with dependencies
- Parallel execution opportunities
- Stack recommendation with rationale
- Key risks and mitigations
- Estimated duration

**Usage:**
```
/plan Build a SaaS dashboard with auth, billing, and analytics
/plan Migrate from MySQL to PostgreSQL with zero downtime
```

**When to use:**
- Before starting a complex multi-phase build
- To understand the scope before committing
- To identify risks and dependencies upfront
- When the prompt has 3+ distinct features
