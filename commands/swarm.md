---
name: swarm
description: Launch a specialized agent swarm for a specific task. Choose from 8 swarms (engineering, operations, business, data, product, growth, review, orchestration) or assemble a custom team.
triggers: [/swarm]
---

# /swarm — Swarm Intelligence Command

Assemble and deploy a specialized agent team for any task.

## Usage

```bash
/swarm engineering "Refactor auth module to use refresh tokens"
/swarm review "Audit the payment processing code for PCI compliance"
/swarm all "Build and deploy a microservices architecture"
/swarm custom backend,security-reviewer,tester "Add rate limiting to all API endpoints"
```

## Available Swarms

| Swarm | Agents | Best For |
|-------|--------|----------|
| `engineering` | backend, frontend, architect, planner | Code generation, refactoring |
| `operations` | deploy, ci-agent, run-agent | DevOps, CI/CD, deployments |
| `business` | spec-analyst, researcher | Requirements, research |
| `data` | database-reviewer, data-modeler | Schema design, migrations |
| `product` | tester, ux-reviewer | UX, E2E testing, accessibility |
| `growth` | scribe, doc-writer | Docs, changelogs, API docs |
| `review` | validator, security-reviewer, code-reviewer, api-guardian | Quality gates |
| `orchestration` | planner, goal-loop-controller | Complex autonomous tasks |

## Execution Modes

```bash
/swarm review --mode parallel   # All agents run simultaneously
/swarm review --mode sequential # Agents run in order
/swarm review --mode chunked    # 2 agents at a time
```

## Consensus Gate

For critical decisions (deploy, breaking changes):
```bash
/swarm all --consensus          # Require 2/3 swarm approval
```

## Anti-Sycophancy

All swarm reviews use blind review by default:
- Each agent sees the code, not other agents' verdicts
- Requires 2/3 consensus to approve
- Anti-sycophancy score reported (higher = more independent)

## Output

```
Swarm: review (4 agents)
Mode: parallel | Consensus: 2/3 required

Agent Results:
  ✓ validator       — APPROVED (types: ✓, tests: ✓, contracts: ✓)
  ✓ code-reviewer   — APPROVED (correctness: ✓, perf: ✓)
  ✗ security-reviewer — CHANGES REQUIRED
    → CWE-89: SQL injection risk in userSearch()
    → CWE-798: Hardcoded JWT secret detected

Consensus: BLOCKED (2/3 needed, got 2/3 but security hard-blocks)
Anti-sycophancy score: 0.78 (good independence)
Action required: Fix security issues before merge
```
