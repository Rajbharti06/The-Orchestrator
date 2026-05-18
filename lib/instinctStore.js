/**
 * instinctStore.js - Instinct-based learning system
 *
 * Stores learned patterns with confidence scores (0-1).
 * Instincts are lightweight, high-frequency patterns that inform agent behavior.
 * They graduate into formal skills once confidence exceeds threshold.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INSTINCTS_PATH = join(__dirname, '..', 'memory', 'instincts.json');
const PRUNE_THRESHOLD = 0.2;
const SKILL_GRADUATION_THRESHOLD = 0.85;
const PRUNE_AGE_DAYS = 30;

/**
 * @typedef {Object} Instinct
 * @property {string} id
 * @property {string} pattern - Short description of the pattern
 * @property {string} context - When this instinct applies (stack, task type, etc.)
 * @property {string[]} tags - Searchable tags
 * @property {number} confidence - 0-1 confidence score
 * @property {string[]} evidence - Evidence supporting this instinct
 * @property {string} created - ISO timestamp
 * @property {string} updated - ISO timestamp
 * @property {number} uses - How many times this instinct has been used
 * @property {number} successes - How many times use led to success
 * @property {number} failures - How many times use led to failure
 */

let instincts = [];

function ensureMemoryDir() {
  const memDir = join(__dirname, '..', 'memory');
  if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });
}

function loadInstincts() {
  try {
    ensureMemoryDir();
    if (existsSync(INSTINCTS_PATH)) {
      instincts = JSON.parse(readFileSync(INSTINCTS_PATH, 'utf-8'));
    }
  } catch {
    instincts = [];
  }
}

function saveInstincts() {
  try {
    ensureMemoryDir();
    writeFileSync(INSTINCTS_PATH, JSON.stringify(instincts, null, 2));
  } catch {
    // Non-critical
  }
}

loadInstincts();

/**
 * Add a new instinct or merge with existing similar one.
 * @param {Object} opts
 * @param {string} opts.pattern - Pattern description
 * @param {string} opts.context - When this applies
 * @param {string[]} [opts.tags] - Searchable tags
 * @param {string} [opts.evidence] - Supporting evidence
 * @param {number} [opts.initialConfidence=0.5] - Starting confidence
 * @returns {Instinct} The created or updated instinct
 */
export function addInstinct({ pattern, context, tags = [], evidence, initialConfidence = 0.5 }) {
  // Check for very similar existing instinct (simple dedup by pattern similarity)
  const existing = instincts.find(
    (i) =>
      i.pattern.toLowerCase().includes(pattern.toLowerCase().slice(0, 30)) ||
      pattern.toLowerCase().includes(i.pattern.toLowerCase().slice(0, 30))
  );

  if (existing) {
    // Merge: increase confidence slightly and add evidence
    existing.confidence = Math.min(1, existing.confidence + 0.05);
    if (evidence && !existing.evidence.includes(evidence)) {
      existing.evidence.push(evidence);
    }
    existing.updated = new Date().toISOString();
    saveInstincts();
    return existing;
  }

  const instinct = {
    id: randomUUID(),
    pattern,
    context,
    tags,
    confidence: initialConfidence,
    evidence: evidence ? [evidence] : [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    uses: 0,
    successes: 0,
    failures: 0,
  };

  instincts.push(instinct);
  saveInstincts();
  return instinct;
}

/**
 * Update confidence for an instinct based on outcome.
 * @param {string} instinctId
 * @param {'success'|'failure'} outcome
 * @param {string} [evidence] - Optional evidence to attach
 */
export function updateConfidence(instinctId, outcome, evidence) {
  const instinct = instincts.find((i) => i.id === instinctId);
  if (!instinct) return;

  instinct.uses++;
  if (outcome === 'success') {
    instinct.successes++;
    // Bayesian-style update: weight toward 1.0
    instinct.confidence = Math.min(
      1,
      instinct.confidence + (1 - instinct.confidence) * 0.15
    );
  } else {
    instinct.failures++;
    // Weight toward 0.0
    instinct.confidence = Math.max(0, instinct.confidence - instinct.confidence * 0.2);
  }

  if (evidence && !instinct.evidence.includes(evidence)) {
    instinct.evidence.push(evidence.slice(0, 200)); // Cap evidence length
  }
  instinct.updated = new Date().toISOString();
  saveInstincts();
}

/**
 * Record that an instinct was used (increments uses counter).
 * @param {string} instinctId
 */
export function recordUse(instinctId) {
  const instinct = instincts.find((i) => i.id === instinctId);
  if (instinct) {
    instinct.uses++;
    instinct.updated = new Date().toISOString();
    saveInstincts();
  }
}

/**
 * Get instincts relevant to the current context.
 * @param {Object} opts
 * @param {string} [opts.context] - Current task context
 * @param {string[]} [opts.tags] - Tags to match
 * @param {number} [opts.minConfidence=0.5] - Minimum confidence
 * @param {number} [opts.limit=10] - Max instincts to return
 * @returns {Instinct[]}
 */
export function getRelevantInstincts({ context = '', tags = [], minConfidence = 0.5, limit = 10 } = {}) {
  const contextLower = context.toLowerCase();
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  return instincts
    .filter((i) => {
      if (i.confidence < minConfidence) return false;

      // Context match
      const contextMatch =
        !context ||
        i.context.toLowerCase().includes(contextLower) ||
        contextLower.includes(i.context.toLowerCase());

      // Tag match
      const tagMatch =
        tags.length === 0 || i.tags.some((t) => tagSet.has(t.toLowerCase()));

      return contextMatch || tagMatch;
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

/**
 * Get all instincts above a confidence threshold.
 * @param {number} [minConfidence=0] - Minimum confidence
 * @returns {Instinct[]}
 */
export function getAllInstincts(minConfidence = 0) {
  return instincts
    .filter((i) => i.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Prune expired or low-confidence instincts.
 * @returns {{ pruned: number, remaining: number }}
 */
export function pruneExpired() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PRUNE_AGE_DAYS);

  const before = instincts.length;

  instincts = instincts.filter((i) => {
    const isLowConfidence = i.confidence < PRUNE_THRESHOLD;
    const isOld = new Date(i.updated) < cutoffDate;

    // Prune if low confidence AND old, or if extremely low confidence (< 0.1)
    if (i.confidence < 0.1) return false;
    if (isLowConfidence && isOld) return false;
    return true;
  });

  saveInstincts();
  return { pruned: before - instincts.length, remaining: instincts.length };
}

/**
 * Identify instincts ready to evolve into formal skills.
 * @returns {Instinct[]} Instincts above graduation threshold
 */
export function evolveToSkill() {
  const candidates = instincts.filter(
    (i) =>
      i.confidence >= SKILL_GRADUATION_THRESHOLD &&
      i.uses >= 5 // Must have been used enough
  );

  // Cluster by tags to identify skill themes
  const clusters = {};
  for (const instinct of candidates) {
    const key = instinct.tags.sort().join(',') || 'general';
    if (!clusters[key]) clusters[key] = [];
    clusters[key].push(instinct);
  }

  return Object.entries(clusters).map(([theme, instinctList]) => ({
    theme,
    instincts: instinctList,
    suggestedSkillName: theme.replace(',', '-') || 'auto-skill',
    avgConfidence: instinctList.reduce((s, i) => s + i.confidence, 0) / instinctList.length,
  }));
}

/**
 * Export instincts as JSON string.
 * @returns {string}
 */
export function exportInstincts() {
  return JSON.stringify(instincts, null, 2);
}

/**
 * Import instincts from JSON string (merges with existing).
 * @param {string} json
 * @returns {{ imported: number, skipped: number }}
 */
export function importInstincts(json) {
  const incoming = JSON.parse(json);
  let imported = 0;
  let skipped = 0;

  for (const instinct of incoming) {
    if (!instincts.find((i) => i.id === instinct.id)) {
      instincts.push(instinct);
      imported++;
    } else {
      skipped++;
    }
  }

  saveInstincts();
  return { imported, skipped };
}

/**
 * Delete an instinct by ID.
 * @param {string} id
 * @returns {boolean} Whether deletion succeeded
 */
export function deleteInstinct(id) {
  const before = instincts.length;
  instincts = instincts.filter((i) => i.id !== id);
  saveInstincts();
  return instincts.length < before;
}

export const instinctStore = {
  addInstinct,
  updateConfidence,
  recordUse,
  getRelevantInstincts,
  getAllInstincts,
  pruneExpired,
  evolveToSkill,
  exportInstincts,
  importInstincts,
  deleteInstinct,
};

export default instinctStore;
