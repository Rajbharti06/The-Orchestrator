/**
 * goalLoop.js - Autonomous goal loop patterns
 *
 * Two patterns for agents that need defined finish lines:
 * - Verifier Loop: repeat until a test condition passes
 * - Completion Loop (ralph-style): continue until output signals "DONE"
 * - Parallel Verifier: run strategies in parallel, use first success
 */

import { lessonStore } from './lessonStore.js';

/**
 * Run a task repeatedly until the verifier passes or max attempts reached.
 *
 * @param {Object} opts
 * @param {Function} opts.task - async fn(context) → result
 * @param {Function} opts.verify - async fn(result, context) → {passed, failures, suggestions}
 * @param {Object} [opts.context] - initial context
 * @param {number} [opts.maxAttempts] - max retry count (default 10)
 * @param {Function} [opts.onFailure] - called with failure info each attempt
 * @returns {Promise<{success: boolean, result: any, attempts: number, history: Array}>}
 */
export async function verifierLoop({ task, verify, context = {}, maxAttempts = 10, onFailure }) {
  const history = [];
  let currentContext = { ...context };
  let lastResult;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastResult = await task(currentContext);
    const verification = await verify(lastResult, currentContext);

    history.push({ attempt, result: lastResult, verification });

    if (verification.passed) {
      return { success: true, result: lastResult, attempts: attempt, history };
    }

    if (onFailure) await onFailure({ attempt, verification, context: currentContext });

    // Inject failures as lessons
    if (verification.failures?.length > 0) {
      lessonStore.addLesson({
        issue: verification.failures.slice(0, 3).join('; '),
        fix: (verification.suggestions || []).slice(0, 3).join('; ') || 'Review and fix the reported issues',
        stack: currentContext.stack || 'unknown',
        tags: ['goal-loop', 'auto', `attempt-${attempt}`],
      });
    }

    // Pass failure info into next attempt
    currentContext = {
      ...currentContext,
      previousFailures: verification.failures,
      suggestions: verification.suggestions,
      attempt,
    };
  }

  return { success: false, result: lastResult, attempts: maxAttempts, history };
}

/**
 * Run an agent until its output contains a completion signal.
 *
 * @param {Object} opts
 * @param {Function} opts.run - async fn(context, history) → string output
 * @param {Object} [opts.context] - initial context
 * @param {string|string[]} [opts.stopSignals] - tokens that indicate completion
 * @param {number} [opts.maxRounds] - max rounds (default 20)
 * @returns {Promise<{success: boolean, output: string, history: string[], rounds: number}>}
 */
export async function completionLoop({
  run,
  context = {},
  stopSignals = ['DONE', 'TASK_COMPLETE', 'FINISHED'],
  maxRounds = 20,
}) {
  const signals = Array.isArray(stopSignals) ? stopSignals : [stopSignals];
  const history = [];
  let currentContext = { ...context };

  for (let round = 1; round <= maxRounds; round++) {
    const output = await run(currentContext, history);
    history.push(output);

    const completed = signals.some(s => output.includes(s));
    if (completed) {
      return { success: true, output, history, rounds: round };
    }

    currentContext = { ...currentContext, previousOutput: output, round };
  }

  return {
    success: false,
    output: history[history.length - 1] || '',
    history,
    rounds: maxRounds,
    reason: 'Max rounds reached without completion signal',
  };
}

/**
 * Run multiple task strategies in parallel; use the first that passes verification.
 *
 * @param {Object} opts
 * @param {Array<Object>} opts.strategies - array of { task, context } objects
 * @param {Function} opts.verify - async fn(result) → {passed}
 * @param {number} [opts.maxAttemptsEach] - per-strategy max attempts
 * @returns {Promise<{success: boolean, result: any, strategyIndex: number}>}
 */
export async function parallelVerifier({ strategies, verify, maxAttemptsEach = 3 }) {
  const results = await Promise.allSettled(
    strategies.map((s, i) =>
      verifierLoop({
        task: s.task,
        verify,
        context: s.context || {},
        maxAttempts: maxAttemptsEach,
      }).then(r => ({ ...r, strategyIndex: i }))
    )
  );

  const winner = results.find(r => r.status === 'fulfilled' && r.value.success);
  if (winner) return winner.value;

  return { success: false, tried: strategies.length, result: null, strategyIndex: -1 };
}

export default { verifierLoop, completionLoop, parallelVerifier };
