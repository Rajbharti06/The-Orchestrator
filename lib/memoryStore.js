/**
 * memoryStore.js - Cross-run persistent memory for build history and context
 *
 * Stores build history, key-value context, and project-level memory.
 * Uses JSON files for simplicity and cross-platform compatibility.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = join(__dirname, '..', 'memory');
const HISTORY_PATH = join(MEMORY_DIR, 'history.json');
const KV_PATH = join(MEMORY_DIR, 'kv.json');

function ensureDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function readJSON(path, fallback) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
  } catch { /* fallback */ }
  return fallback;
}

function writeJSON(path, data) {
  try {
    ensureDir();
    writeFileSync(path, JSON.stringify(data, null, 2));
  } catch { /* non-critical */ }
}

// -----------------------------------------------------------------------
// Build history
// -----------------------------------------------------------------------

/**
 * @typedef {Object} BuildRecord
 * @property {string} id
 * @property {string} prompt
 * @property {string} stack
 * @property {'success'|'failure'|'partial'} outcome
 * @property {number} qaScore
 * @property {number} testPassRate
 * @property {string[]} phases
 * @property {string} deployUrl
 * @property {string} timestamp
 * @property {number} durationMs
 */

/**
 * Record a completed build in history.
 * @param {Omit<BuildRecord, 'id'|'timestamp'>} record
 * @returns {BuildRecord}
 */
export function recordBuild(record) {
  const history = readJSON(HISTORY_PATH, []);

  const entry = {
    id: randomUUID(),
    ...record,
    timestamp: new Date().toISOString(),
  };

  history.unshift(entry);
  // Keep last 100 builds
  writeJSON(HISTORY_PATH, history.slice(0, 100));
  return entry;
}

/**
 * Get build history.
 * @param {number} [limit=20]
 * @returns {BuildRecord[]}
 */
export function getBuildHistory(limit = 20) {
  return readJSON(HISTORY_PATH, []).slice(0, limit);
}

/**
 * Get builds by outcome.
 * @param {'success'|'failure'|'partial'} outcome
 * @returns {BuildRecord[]}
 */
export function getBuildsByOutcome(outcome) {
  return readJSON(HISTORY_PATH, []).filter((b) => b.outcome === outcome);
}

// -----------------------------------------------------------------------
// Key-value store for arbitrary persistent context
// -----------------------------------------------------------------------

/**
 * Set a persistent key-value pair.
 * @param {string} key
 * @param {any} value
 */
export function kvSet(key, value) {
  const kv = readJSON(KV_PATH, {});
  kv[key] = { value, updated: new Date().toISOString() };
  writeJSON(KV_PATH, kv);
}

/**
 * Get a persistent value.
 * @param {string} key
 * @param {any} [defaultValue]
 * @returns {any}
 */
export function kvGet(key, defaultValue = null) {
  const kv = readJSON(KV_PATH, {});
  return kv[key]?.value ?? defaultValue;
}

/**
 * Delete a key.
 * @param {string} key
 */
export function kvDelete(key) {
  const kv = readJSON(KV_PATH, {});
  delete kv[key];
  writeJSON(KV_PATH, kv);
}

/**
 * Get all key-value entries.
 * @returns {Object}
 */
export function kvGetAll() {
  return readJSON(KV_PATH, {});
}

// -----------------------------------------------------------------------
// Stats / analytics
// -----------------------------------------------------------------------

/**
 * Get aggregate build statistics.
 * @returns {Object}
 */
export function getStats() {
  const history = readJSON(HISTORY_PATH, []);

  const total = history.length;
  const successful = history.filter((b) => b.outcome === 'success').length;
  const failed = history.filter((b) => b.outcome === 'failure').length;
  const avgQaScore = total > 0
    ? Math.round(history.reduce((s, b) => s + (b.qaScore || 0), 0) / total)
    : 0;
  const avgDuration = total > 0
    ? Math.round(history.reduce((s, b) => s + (b.durationMs || 0), 0) / total / 1000)
    : 0;

  const stackCounts = {};
  history.forEach((b) => {
    if (b.stack) stackCounts[b.stack] = (stackCounts[b.stack] || 0) + 1;
  });

  const topStack = Object.entries(stackCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

  return {
    total,
    successful,
    failed,
    successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
    avgQaScore,
    avgDurationSeconds: avgDuration,
    topStack,
    stackBreakdown: stackCounts,
  };
}

export const memoryStore = {
  recordBuild,
  getBuildHistory,
  getBuildsByOutcome,
  kvSet,
  kvGet,
  kvDelete,
  kvGetAll,
  getStats,
};

export default memoryStore;
