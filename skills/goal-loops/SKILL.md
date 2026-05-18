---
name: goal-loops
description: Autonomous goal loop patterns — verifier loops and completion-signal loops for persistent agents that keep working until a condition is met.
version: 1.0.0
triggers: [goal-loop, verifier-loop, ralph-loop, retry-until, autonomous-loop, keep-trying, until-done]
tags: [autonomous, loops, persistence, self-directing]
---

# Goal Loops Skill

Two loop patterns for autonomous agents that need defined finish lines.

## Pattern 1: Verifier Loop

Repeat work until a test condition passes.

```javascript
async function verifierLoop(task, maxAttempts = 10) {
  let attempt = 0;
  
  while (attempt < maxAttempts) {
    attempt++;
    
    // Run the task
    const result = await runTask(task);
    
    // Run the verifier
    const verification = await runVerifier(task, result);
    
    if (verification.passed) {
      return { success: true, result, attempts: attempt };
    }
    
    // Inject failures as lessons for next attempt
    await lessonStore.addLesson({
      issue: verification.failures.join(', '),
      fix: verification.suggestions.join(', '),
      attempt,
    });
    
    task = { ...task, context: { ...task.context, previousFailures: verification.failures } };
  }
  
  return { success: false, attempts: maxAttempts, lastResult: result };
}
```

**Use when:** Running code until tests pass, building until QA approves, fixing until no errors.

## Pattern 2: Ralph-Style Completion Loop

Continue until the output contains a completion signal.

```javascript
async function completionLoop(task, stopSignal = 'DONE', maxRounds = 20) {
  const history = [];
  let round = 0;
  
  while (round < maxRounds) {
    round++;
    
    const output = await runAgent(task, { history });
    history.push(output);
    
    if (output.includes(stopSignal) || output.includes('TASK_COMPLETE')) {
      return { success: true, history, rounds: round };
    }
    
    // Continue with accumulated context
    task = { ...task, previousOutput: output };
  }
  
  return { success: false, history, rounds: maxRounds, reason: 'max rounds reached' };
}
```

**Use when:** Autonomous debugging that keeps going until "DONE", research that continues until findings are complete.

## Parallel Verifier Pattern

Run multiple strategies simultaneously, use the first that passes:

```javascript
async function parallelVerify(strategies, verifier) {
  const results = await Promise.allSettled(
    strategies.map(s => verifierLoop(s, 3))
  );
  
  return results.find(r => r.status === 'fulfilled' && r.value.success)?.value
    || { success: false, tried: strategies.length };
}
```

## Goal Loop Config

```javascript
// In orchestrator options
{
  loopType: 'verifier',    // 'verifier' | 'completion' | 'parallel'
  maxAttempts: 10,
  stopSignal: 'DONE',      // for completion loops
  verifier: 'qaAgent',     // which agent verifies
  onFailure: 'inject-lessons', // 'inject-lessons' | 'search-web' | 'abort'
}
```

## When to Use Each Pattern

| Situation | Pattern |
|-----------|---------|
| Fix until tests pass | Verifier Loop |
| Build until QA approves | Verifier Loop |
| Research until findings complete | Completion Loop |
| Autonomous debugging session | Completion Loop |
| Try multiple approaches | Parallel Verifier |
