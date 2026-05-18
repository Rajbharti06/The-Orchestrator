---
name: godmode
description: Self-orchestrating multi-agent development system. You say WHAT, the system decides HOW. 8 specialized agents with decision matrix quality gates and version-first discipline.
version: 5.11.3
triggers: [godmode, god-mode, full-pipeline, orchestrate, multi-agent, agent council]
tags: [orchestration, multi-agent, quality-gates, autonomous]
---

# GodMode — Multi-Agent Orchestration Skill

You specify WHAT. The agent system decides HOW.

## The 8 Agents

| Agent | Model | Primary Function |
|-------|-------|-----------------|
| @researcher | haiku | Tech evaluation, best practices, error solutions |
| @architect | opus | Architecture decisions, module design, dependency graph |
| @api-guardian | sonnet | Breaking change analysis, API consumer discovery |
| @builder | sonnet | Code generation following the architect's spec |
| @validator | sonnet | TypeScript, tests (80% coverage), error handling |
| @tester | sonnet | E2E tests, screenshots, accessibility, performance |
| @scribe | haiku | CHANGELOG, VERSION, README, API docs |
| @github-manager | haiku | Issues, PRs, releases, repository operations |

## Standard Workflows

### New Feature (Full)
```
@researcher (optional, 30s timeout) → @architect → @builder → @validator + @tester (parallel) → @scribe
```

### Bug Fix (Quick)
```
@builder → @validator + @tester (parallel)
```

### API Change (Critical — guardian required)
```
@researcher → @architect → @api-guardian → @builder → @validator + @tester → @scribe
```

### Refactoring
```
@architect → @builder → @validator + @tester (parallel)
```

### Release
```
@scribe → @github-manager
```

## Decision Matrix (After @builder)

| @validator | @tester | Action |
|------------|---------|--------|
| ✅ APPROVED | ✅ APPROVED | → @scribe |
| ✅ APPROVED | 🔴 BLOCKED | → @builder (fix UX issues) |
| 🔴 BLOCKED | ✅ APPROVED | → @builder (fix code issues) |
| 🔴 BLOCKED | 🔴 BLOCKED | → @builder (merged feedback) |

## 10 Golden Rules

1. **Version-First** — Read VERSION file before any work starts
2. **@researcher for Unknown Tech** — Never guess when you can research
3. **@architect is the Gate** — No feature begins without architecture sign-off
4. **@api-guardian MANDATORY** — Required for ANY API modification
5. **Dual Quality Gates** — Both @validator AND @tester must approve
6. **@tester Creates Screenshots** — Every page at 375px, 768px, 1920px
7. **Use Task Tool** — Delegate agents via Task tool, not inline
8. **No Skipping** — Every workflow agent must run; no shortcuts
9. **Reports in reports/vX.X.X/** — Organized by version
10. **NEVER git push without permission** — @github-manager waits for approval

## Report Structure

```
reports/v[VERSION]/
├── 00-researcher-report.md  (if used)
├── 01-architect-report.md
├── 02-api-guardian-report.md  (if API changed)
├── 03-builder-report.md
├── 04-validator-report.md
├── 05-tester-report.md
└── 06-scribe-report.md
```

## Starting a Workflow

When you receive a request:
1. Check VERSION file for current version
2. Create `reports/v[NEXT_VERSION]/` folder
3. Announce: "Working on vX.X.X — [description]"
4. Select workflow pattern based on request type
5. Activate agents in order (except parallel gates)

## Quick Commands

| Say | Workflow |
|-----|----------|
| `New Feature: [X]` | Full: research → design → build → test → document |
| `Bug Fix: [X]` | Quick: build → validate → test |
| `API Change: [X]` | Safe: research → design → guardian → build → gates |
| `Research: [X]` | Investigation only |
| `Prepare Release` | Documentation → GitHub publish |
