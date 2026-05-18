/**
 * rarvLoop.js - RARV Cycle Engine (Loki Mode)
 *
 * Implements the Reason→Act→Reflect→Verify autonomous loop.
 * On verify failure, injects lessons and retries up to maxCycles.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { lessonStore } from './lessonStore.js';
const addLesson = (...args) => lessonStore.addLesson(...args);

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOKI_DIR = join(__dirname, '..', '.loki');

function ensureLokiDir() {
  if (!existsSync(LOKI_DIR)) mkdirSync(LOKI_DIR, { recursive: true });
}

/**
 * @typedef {Object} RARVContext
 * @property {string} jobId
 * @property {string} goal
 * @property {Record<string, any>} episodic   - Task-specific facts from this run
 * @property {Record<string, any>} semantic   - Reusable domain patterns
 * @property {Record<string, any>} procedural - Skill/process knowledge
 * @property {Array<any>} previousFailures
 * @property {number} cycleCount
 */

/**
 * Create an initial RARV context with memory slots pre-populated.
 * @param {Partial<RARVContext>} spec
 * @returns {RARVContext}
 */
export function createRARVContext(spec = {}) {
  return {
    jobId: spec.jobId ?? `rarv-${Date.now()}`,
    goal: spec.goal ?? '',
    episodic: spec.episodic ?? {},
    semantic: spec.semantic ?? {},
    procedural: spec.procedural ?? {},
    previousFailures: spec.previousFailures ?? [],
    cycleCount: 0,
    ...spec,
  };
}

function writeSession(ctx, phase) {
  try {
    ensureLokiDir();
    const sessionPath = join(LOKI_DIR, 'session.json');
    const existing = existsSync(sessionPath)
      ? JSON.parse(readFileSync(sessionPath, 'utf-8'))
      : {};
    writeFileSync(sessionPath, JSON.stringify({
      ...existing,
      pid: process.pid,
      startedAt: existing.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phase,
      cycleCount: ctx.cycleCount,
    }, null, 2));
  } catch { /* non-fatal */ }
}

async function checkPauseStop() {
  const pausePath = join(LOKI_DIR, '.PAUSE');
  const stopPath  = join(LOKI_DIR, '.STOP');

  if (existsSync(stopPath)) throw new Error('STOP signal received');

  while (existsSync(pausePath)) {
    await new Promise(r => setTimeout(r, 5000));
    if (existsSync(stopPath)) throw new Error('STOP signal received');
  }
}

/**
 * Run a RARV autonomous loop.
 *
 * @param {object} opts
 * @param {(ctx: RARVContext) => Promise<any>}          opts.reason  - Produce reasoning given context
 * @param {(reasoning: any, ctx: RARVContext) => Promise<any>} opts.act    - Execute action from reasoning
 * @param {(result: any, ctx: RARVContext) => Promise<any>}    opts.reflect - Extract lessons from result
 * @param {(result: any, ctx: RARVContext) => Promise<boolean>} opts.verify - Return true if result is acceptable
 * @param {RARVContext}  opts.context
 * @param {number}       [opts.maxCycles=10]
 * @param {(cycle: number, phase: string, data: any) => void} [opts.onCycle]
 * @returns {Promise<{result: any, cycles: number, context: RARVContext}>}
 */
export async function rarvLoop({ reason, act, reflect, verify, context, maxCycles = 10, onCycle } = {}) {
  const ctx = { ...createRARVContext(), ...context };
  let lastResult = null;

  writeSession(ctx, 'start');

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    ctx.cycleCount = cycle;

    try {
      await checkPauseStop();

      // REASON
      writeSession(ctx, 'reason');
      onCycle?.(cycle, 'reason', null);
      const reasoning = await reason(ctx);

      await checkPauseStop();

      // ACT
      writeSession(ctx, 'act');
      onCycle?.(cycle, 'act', reasoning);
      const result = await act(reasoning, ctx);
      lastResult = result;

      await checkPauseStop();

      // REFLECT
      writeSession(ctx, 'reflect');
      onCycle?.(cycle, 'reflect', result);
      const reflection = await reflect(result, ctx);
      ctx.episodic[`cycle_${cycle}_reflection`] = reflection;

      await checkPauseStop();

      // VERIFY
      writeSession(ctx, 'verify');
      onCycle?.(cycle, 'verify', result);
      const verified = await verify(result, ctx);

      if (verified) {
        writeSession(ctx, 'complete');
        return { result, cycles: cycle, context: ctx };
      }

      // Failure: record and loop
      const failure = { cycle, reasoning, result, reflection, timestamp: new Date().toISOString() };
      ctx.previousFailures.push(failure);

      try {
        await addLesson({
          issue: `RARV cycle ${cycle} verify failed for goal: ${ctx.goal}`,
          cause: JSON.stringify(reflection),
          fix: 'Review reasoning and retry with updated context',
          stack: 'rarv-loop',
          tags: ['rarv', 'auto-retry'],
        });
      } catch { /* non-fatal */ }

    } catch (err) {
      if (err.message === 'STOP signal received') throw err;
      ctx.previousFailures.push({ cycle, error: err.message, timestamp: new Date().toISOString() });
    }
  }

  return { result: lastResult, cycles: maxCycles, context: ctx, exhausted: true };
}
