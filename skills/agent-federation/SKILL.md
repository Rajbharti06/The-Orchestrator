---
name: agent-federation
description: Named agent communication with 3 coordination topologies — Pipeline (A→B→C), Fan-out/Fan-in (parallel→synthesize), and Supervisor/Worker (dispatch→aggregate). From Ruflo/Claude Flow v3.
version: 1.0.0
triggers: [federation, named-agents, send-message, pipeline-topology, fan-out, supervisor-worker]
tags: [federation, coordination, topology, multi-agent, architecture]
---

# Agent Federation Skill

Named agents that communicate directly. No more centralized polling.

## Core Rule

> "Every agent MUST have a name so it's addressable. Communication happens via SendMessage, not polling or shared memory."

## 3 Coordination Topologies

### 1. Pipeline — Sequential Handoffs
Each agent's output becomes the next agent's input:
```
researcher → architect → builder → validator → tester → scribe
```
```javascript
const result = await agentFederation.pipeline(
  ['researcher', 'architect', 'builder', 'validator'],
  initialInput
);
```

### 2. Fan-out / Fan-in — Parallel + Synthesize
All agents receive the same input simultaneously; results are merged:
```
              ┌─ validator ─┐
input ────────┤             ├──── synthesize ──── output
              └─ tester    ─┘
```
```javascript
const results = await agentFederation.fanOut(['validator', 'tester'], input);
const merged = await agentFederation.fanIn(results, synthesizeFn);
```

### 3. Supervisor / Worker — Dispatch + Aggregate
Supervisor breaks work into tasks, dispatches to workers, collects results:
```javascript
const result = await agentFederation.supervisor(
  supervisorAgent,
  ['backend-worker', 'frontend-worker', 'db-worker'],
  tasks
);
```

## Message Routing

```javascript
// Register named agent
agentFederation.register('security-reviewer', async (msg) => {
  return await runSecurityReview(msg.code);
});

// Send message to named agent
const result = await agentFederation.sendMessage(
  'security-reviewer',     // to
  { code: files },         // message
  'orchestrator'           // from
);
```

## When to Use Each Topology

| Situation | Topology |
|-----------|---------|
| Sequential quality gates | Pipeline |
| Parallel validation | Fan-out/Fan-in |
| Distributing subtasks | Supervisor/Worker |
| Single specialist | Direct sendMessage |

## MCP vs Task Tool Separation

- **MCP tools** → coordination only (swarm init, agent registration, topology setup)
- **Claude Code Task tool** → execution (file ops, code gen, bash commands)

Never use MCP for actual work — only for coordination strategy.
