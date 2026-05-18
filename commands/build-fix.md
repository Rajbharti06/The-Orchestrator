---
description: Fix build errors automatically — runs build, captures errors, searches for solutions, and applies targeted fixes. Loops up to 5 times until the build succeeds.
argument-hint: "[build command, default: npm run build]"
---

# /build-fix — Automated Build Repair

Run the build, capture failures, and fix them automatically.

**Loop:**
1. Run build command
2. Parse error output
3. Search lesson store for known fixes
4. If unknown: web search for solutions
5. Apply targeted fix (only affected files)
6. Loop until success or max 5 attempts

**Error Types Handled:**
- TypeScript type errors
- Import/module resolution failures
- Missing dependencies
- Syntax errors
- Environment variable misconfiguration
- Port conflicts

**Usage:**
```
/build-fix
/build-fix npm run build
/build-fix python -m pytest
```

**Outputs:**
- Per-attempt summary (error count, fixes applied)
- Final result (success or remaining errors)
- New lessons added to lesson store for future builds
