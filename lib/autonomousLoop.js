/**
 * autonomousLoop.js - Self-improvement loop
 *
 * Runs eval → analyzes weaknesses → writes lessons → updates instinct confidence → repeats.
 * Non-blocking, fully managed via start/stop API.
 */

import { evalEngine } from './evalEngine.js';
import { lessonStore } from './lessonStore.js';
import { instinctStore } from './instinctStore.js';
import { providerScoring } from './providerScoring.js';
import { callLLM } from './llmRouter.js';

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** @type {NodeJS.Timeout|null} */
let loopTimer = null;
let isRunning = false;
let cycleCount = 0;
let lastCycleAt = null;
let lastScore = null;

/**
 * @typedef {Object} CycleResult
 * @property {number} score - Overall eval score
 * @property {number} prevScore - Previous score
 * @property {string} trend - 'improving'|'declining'|'stable'
 * @property {number} lessonsAdded - New lessons learned this cycle
 * @property {number} instinctsUpdated - Instincts confidence-updated this cycle
 * @property {string} timestamp
 */

/** @type {CycleResult[]} */
const cycleHistory = [];

/**
 * Run a single autonomous improvement cycle.
 * @returns {Promise<CycleResult>}
 */
export async function runCycle() {
  const start = Date.now();

  // 1. Run eval suite
  const evalResult = await evalEngine.runEvalSuite({ parallel: true });
  const currentScore = evalResult.score;

  // 2. Analyze failures and extract lessons
  const failedCases = evalResult.results.filter((r) => !r.passed);
  let lessonsAdded = 0;

  for (const failedCase of failedCases) {
    try {
      const analysis = await analyzeFail(failedCase);
      if (analysis) {
        lessonStore.addLesson({
          issue: `Eval case "${failedCase.name}" failed with score ${failedCase.score}`,
          cause: analysis.cause,
          fix: analysis.fix,
          stack: 'general',
          tags: ['eval', failedCase.id],
        });
        lessonsAdded++;
      }
    } catch {
      // Non-critical — continue loop
    }
  }

  // 3. Update instinct confidence based on score trajectory
  const weakAreas = evalEngine.getWeakAreas();
  let instinctsUpdated = 0;

  const allInstincts = instinctStore.getAllInstincts(0);
  for (const instinct of allInstincts.slice(0, 20)) {
    // Bump confidence for instincts related to high-scoring areas
    const isWeakArea = weakAreas.some((w) =>
      instinct.tags.includes(w.id) || instinct.context.includes(w.name.toLowerCase())
    );

    if (isWeakArea) {
      instinctStore.updateConfidence(instinct.id, 'failure', `Weak area: ${weakAreas[0]?.name}`);
      instinctsUpdated++;
    }
  }

  // 4. Prune expired instincts
  instinctStore.pruneExpired();

  const cycle = {
    score: currentScore,
    prevScore: lastScore ?? currentScore,
    trend: evalEngine.getTrend(),
    lessonsAdded,
    instinctsUpdated,
    failedCases: failedCases.length,
    totalCases: evalResult.totalCount,
    durationMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  };

  cycleHistory.unshift(cycle);
  if (cycleHistory.length > 100) cycleHistory.pop();

  lastScore = currentScore;
  lastCycleAt = new Date().toISOString();
  cycleCount++;

  return cycle;
}

/**
 * Analyze a failed eval case to extract cause and fix.
 * @param {Object} failedCase
 * @returns {Promise<{cause: string, fix: string}|null>}
 */
async function analyzeFail(failedCase) {
  if (process.env.MOCK === 'true') {
    return {
      cause: `Eval case ${failedCase.id} failed pattern matching`,
      fix: `Ensure output includes: ${failedCase.matchedPatterns?.slice(0, 2).join(', ')}`,
    };
  }

  try {
    const response = await callLLM({
      prompt: `An AI system failed this eval case:
Name: ${failedCase.name}
Score: ${failedCase.score}/100
Error: ${failedCase.error || 'Pattern mismatch'}

Return JSON: {"cause": "root cause in one sentence", "fix": "how to fix in one sentence"}`,
      task: 'qa',
      maxTokens: 200,
    });

    const json = response.match(/\{[^}]+\}/);
    if (json) return JSON.parse(json[0]);
  } catch {
    return null;
  }

  return null;
}

/**
 * Start the autonomous improvement loop.
 * @param {number} [intervalMs] - Interval between cycles (default: 10 min)
 */
export function startLoop(intervalMs = DEFAULT_INTERVAL_MS) {
  if (isRunning) return;

  isRunning = true;

  const tick = async () => {
    if (!isRunning) return;
    try {
      await runCycle();
    } catch {
      // Loop must never crash
    }
    if (isRunning) {
      loopTimer = setTimeout(tick, intervalMs);
    }
  };

  // Run first cycle after a short delay to not block startup
  loopTimer = setTimeout(tick, 5000);
}

/**
 * Stop the autonomous improvement loop.
 */
export function stopLoop() {
  isRunning = false;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

/**
 * Get current loop status.
 * @returns {Object}
 */
export function getStatus() {
  return {
    running: isRunning,
    cycleCount,
    lastCycleAt,
    lastScore,
    trend: cycleHistory.length > 0 ? evalEngine.getTrend() : 'unknown',
    weakAreas: evalEngine.getWeakAreas(),
    recentCycles: cycleHistory.slice(0, 5),
  };
}

/**
 * Get full cycle history.
 * @returns {CycleResult[]}
 */
export function getCycleHistory() {
  return [...cycleHistory];
}

export const autonomousLoop = { runCycle, startLoop, stopLoop, getStatus, getCycleHistory };
export default autonomousLoop;
