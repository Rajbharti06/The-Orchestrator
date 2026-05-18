---
name: swarm-intelligence
description: 8-swarm agent architecture — engineering, operations, business, data, product, growth, review, orchestration. Assemble the right swarm for the right task automatically.
version: 1.0.0
triggers: [swarm, swarms, agent-swarm, team-assembly, engineering-swarm, multi-swarm]
tags: [swarm, architecture, team, parallel, coordination]
---

# Swarm Intelligence Skill

Organize 42 agents into 8 specialized swarms. Deploy the exact team the task needs.

## The 8 Swarms

| Swarm | Purpose | Agents |
|-------|---------|--------|
| **engineering** | Core code generation and architecture | backend, frontend, architect, planner |
| **operations** | DevOps, CI/CD, deployment, monitoring | deploy, ci-agent, run-agent |
| **business** | PRD analysis, market, user stories | spec-analyst, researcher |
| **data** | Database design, migrations, optimization | database-reviewer, data-modeler |
| **product** | UX, accessibility, performance | tester, ux-reviewer |
| **growth** | Documentation, onboarding, API docs | scribe, doc-writer |
| **review** | Quality gates, security, anti-sycophancy | validator, security-reviewer, code-reviewer, api-guardian |
| **orchestration** | Meta-coordination, loop control | planner, goal-loop-controller |

## Swarm Assembly Algorithm

```javascript
import { assembleTeam } from './lib/swarmCoordinator.js';

const team = await assembleTeam(spec);
// Returns: { swarms: ['engineering', 'review'], agents: [...], parallelism: 4 }
```

Selection logic:
- **Low complexity** → `engineering` + `review`
- **Medium complexity** → + `operations` + `data`
- **High complexity** → all swarms, priority-ordered
- **API change** → always include `review` swarm (api-guardian mandatory)

## Running a Swarm

```javascript
import { runSwarm } from './lib/swarmCoordinator.js';

// Parallel execution within swarm
const results = await runSwarm('review', task, context);

// Multi-swarm coordination
const allResults = await coordinateSwarms(['engineering', 'review'], task);
```

## Swarm Modes

- `parallel` — all agents run simultaneously (fastest, requires isolated state)
- `sequential` — agents run in order (safer for shared state)
- `chunked` — run N agents at a time (balance speed and safety)

## Raft Consensus

For critical decisions (deploy, breaking changes), the orchestration swarm uses majority vote:
- At least 2/3 agents must agree before action is taken
- Prevents single-agent errors from propagating
- Anti-sycophancy: agents vote before seeing others' votes

## Integration

```javascript
// Get current swarm status
const status = getSwarmStatus();
// { engineering: { active: 2, completed: 7 }, review: { active: 1 } }
```
