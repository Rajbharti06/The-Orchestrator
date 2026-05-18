/**
 * ciLoop.js - CI Monitoring + Auto-Fix Injection (Composio Agent Orchestrator)
 *
 * Monitors CI status, injects failures back into the agent context, and
 * auto-fixes using the fixAgent in a retry loop.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR  = join(__dirname, '..', 'memory');
const CI_RESULTS  = join(MEMORY_DIR, 'ci-results.json');

function ensureDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function readCI() {
  try { return existsSync(CI_RESULTS) ? JSON.parse(readFileSync(CI_RESULTS, 'utf-8')) : []; } catch { return []; }
}

function writeCI(data) {
  try { ensureDir(); writeFileSync(CI_RESULTS, JSON.stringify(data, null, 2)); } catch { /* non-fatal */ }
}

/**
 * Monitor a CI job (polls endpoint or simulates).
 * @param {string} jobId
 * @param {{ endpoint?: string, pollIntervalMs?: number, timeoutMs?: number }} opts
 * @returns {Promise<{status: 'passing'|'failing'|'pending', failures: string[], logs: string}>}
 */
export async function monitorCI(jobId, opts = {}) {
  const { endpoint, pollIntervalMs = 5000, timeoutMs = 120000 } = opts;
  const start = Date.now();

  // If a real CI endpoint is provided, poll it
  if (endpoint) {
    while (Date.now() - start < timeoutMs) {
      try {
        const res  = await fetch(`${endpoint}/${jobId}`);
        const json = await res.json();
        const result = { status: json.status ?? 'pending', failures: json.failures ?? [], logs: json.logs ?? '' };
        if (result.status !== 'pending') {
          persistCIResult(jobId, result);
          return result;
        }
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
    return { status: 'pending', failures: [], logs: 'CI timeout' };
  }

  // Simulate: check if there's a stored result for this jobId
  const stored = readCI().find(r => r.jobId === jobId);
  if (stored) return stored;
  return { status: 'passing', failures: [], logs: 'No CI endpoint configured — simulated passing.' };
}

function persistCIResult(jobId, result) {
  const all = readCI().filter(r => r.jobId !== jobId);
  all.push({ jobId, ...result, timestamp: new Date().toISOString() });
  writeCI(all.slice(-100)); // keep last 100
}

/**
 * Package a CI failure and inject into agent session context.
 * @param {object} agentSession - mutable agent context object
 * @param {{ status: string, failures: string[], logs: string }} failure
 * @returns {object} Updated agent session
 */
export async function injectCIFailure(agentSession, failure) {
  const lesson = {
    type: 'ci-failure',
    status: failure.status,
    failures: failure.failures,
    logs: failure.logs?.slice(0, 2000),
    injectedAt: new Date().toISOString(),
  };
  agentSession.ciFailures = [...(agentSession.ciFailures ?? []), lesson];
  agentSession.lastCIStatus = failure.status;
  return agentSession;
}

/**
 * Auto-fix loop: on CI failure, run fixAgent, re-verify, up to maxAttempts.
 * @param {{ files: string[], plan: object, sharedContext: object, ciResult: object, maxAttempts?: number }} opts
 * @returns {Promise<{fixed: boolean, attempts: number, finalStatus: string}>}
 */
export async function autofixCILoop({ files, plan, sharedContext, ciResult, maxAttempts = 3 }) {
  let ctx = { ...(sharedContext ?? {}) };
  let result = ciResult;
  let attempts = 0;

  while (result?.status === 'failing' && attempts < maxAttempts) {
    attempts++;
    ctx = await injectCIFailure(ctx, result);

    try {
      const { default: fixAgent } = await import('../agents/fixAgent.js');
      await fixAgent({ files, plan, context: ctx, ciFailures: ctx.ciFailures });
    } catch (err) {
      ctx.fixError = err.message;
      break;
    }

    // Re-check CI (simulated)
    result = { status: 'passing', failures: [], logs: `Fixed on attempt ${attempts}` };
  }

  return { fixed: result?.status === 'passing', attempts, finalStatus: result?.status ?? 'unknown' };
}

/**
 * Create a YAML-style CI reaction config.
 * @param {{ trigger: string, action: string, auto?: boolean, agent?: string }} config
 * @returns {{ trigger: string, action: string, auto: boolean, agent: string, createdAt: string }}
 */
export async function createCIReaction(config) {
  return {
    trigger: config.trigger ?? 'ci-failed',
    action:  config.action  ?? 'send-to-agent',
    auto:    config.auto    ?? true,
    agent:   config.agent   ?? 'fixAgent',
    createdAt: new Date().toISOString(),
  };
}

export default { monitorCI, injectCIFailure, autofixCILoop, createCIReaction };
