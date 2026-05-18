/**
 * selfHeal.js - Subsystem health monitoring and auto-recovery
 *
 * Monitors all subsystems and attempts recovery when they fail.
 * Provides health status endpoint data for the dashboard.
 */

import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {'healthy'|'degraded'|'down'} HealthStatus
 * @typedef {Object} SubsystemHealth
 * @property {string} name
 * @property {HealthStatus} status
 * @property {string} message
 * @property {string} checkedAt
 * @property {number} latencyMs
 */

/** @type {Map<string, SubsystemHealth>} */
const healthMap = new Map();

/** @type {Map<string, () => Promise<boolean>>} */
const healthChecks = new Map();

/**
 * Register a health check for a subsystem.
 * @param {string} name - Subsystem name
 * @param {() => Promise<boolean>} checkFn - Returns true if healthy
 */
export function registerCheck(name, checkFn) {
  healthChecks.set(name, checkFn);
}

/**
 * Run all registered health checks.
 * @returns {Promise<SubsystemHealth[]>}
 */
export async function runAllChecks() {
  const results = [];

  for (const [name, checkFn] of healthChecks.entries()) {
    const start = Date.now();
    try {
      const ok = await Promise.race([
        checkFn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);

      const health = {
        name,
        status: ok ? 'healthy' : 'degraded',
        message: ok ? 'OK' : 'Check returned false',
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };

      healthMap.set(name, health);
      results.push(health);
    } catch (err) {
      const health = {
        name,
        status: 'down',
        message: err.message,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };

      healthMap.set(name, health);
      results.push(health);
    }
  }

  return results;
}

/**
 * Get current health status for all subsystems.
 * @returns {Object}
 */
export function getHealthStatus() {
  const subsystems = Array.from(healthMap.values());
  const allHealthy = subsystems.every((s) => s.status === 'healthy');
  const anyDown = subsystems.some((s) => s.status === 'down');

  return {
    overall: anyDown ? 'down' : allHealthy ? 'healthy' : 'degraded',
    subsystems,
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    nodeVersion: process.version,
    pid: process.pid,
  };
}

// -----------------------------------------------------------------------
// Built-in health checks
// -----------------------------------------------------------------------

/**
 * Register default health checks for all core subsystems.
 */
export function registerDefaults() {
  // Memory directory check
  registerCheck('memory-store', async () => {
    const memDir = join(__dirname, '..', 'memory');
    if (!existsSync(memDir)) {
      mkdirSync(memDir, { recursive: true });
    }
    return existsSync(memDir);
  });

  // LLM router check (just imports, doesn't call)
  registerCheck('llm-router', async () => {
    try {
      await import('./llmRouter.js');
      return true;
    } catch {
      return false;
    }
  });

  // Lesson store check
  registerCheck('lesson-store', async () => {
    try {
      const { lessonStore } = await import('./lessonStore.js');
      return typeof lessonStore.getAllLessons === 'function';
    } catch {
      return false;
    }
  });

  // Instinct store check
  registerCheck('instinct-store', async () => {
    try {
      const { instinctStore } = await import('./instinctStore.js');
      return typeof instinctStore.getAllInstincts === 'function';
    } catch {
      return false;
    }
  });

  // Skills directory check
  registerCheck('skill-loader', async () => {
    const skillsDir = join(__dirname, '..', 'skills');
    return existsSync(skillsDir);
  });

  // Node.js process health
  registerCheck('process', async () => {
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / 1024 / 1024;
    return heapUsedMB < 500; // Fail if heap > 500MB
  });
}

/**
 * Start periodic health checks.
 * @param {number} [intervalMs=60000] - Check interval
 * @returns {NodeJS.Timeout}
 */
export function startPeriodicChecks(intervalMs = 60_000) {
  registerDefaults();
  runAllChecks(); // Run immediately
  return setInterval(runAllChecks, intervalMs);
}

export const selfHeal = {
  registerCheck,
  runAllChecks,
  getHealthStatus,
  registerDefaults,
  startPeriodicChecks,
};

export default selfHeal;
