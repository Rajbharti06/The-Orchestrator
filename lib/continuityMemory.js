/**
 * continuityMemory.js - 3-Layer Memory System (Loki Mode)
 *
 * Episodic (task-specific outcomes), Semantic (reusable domain patterns),
 * Procedural (skill/process knowledge). All layers persisted to disk.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR  = join(__dirname, '..', 'memory');
const EPISODIC    = join(MEMORY_DIR, 'episodic');
const SEMANTIC    = join(MEMORY_DIR, 'semantic');
const PROCEDURAL  = join(MEMORY_DIR, 'procedural');

function ensureDirs() {
  for (const dir of [EPISODIC, SEMANTIC, PROCEDURAL]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

function readJSON(path, fallback) {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : fallback; } catch { return fallback; }
}

function writeJSON(path, data) {
  try { writeFileSync(path, JSON.stringify(data, null, 2)); } catch { /* non-fatal */ }
}

function layerPath(layer, name) {
  const dirs = { episodic: EPISODIC, semantic: SEMANTIC, procedural: PROCEDURAL };
  return join(dirs[layer], `${name}.json`);
}

// ---------------------------------------------------------------------------
// Episodic layer
// ---------------------------------------------------------------------------

/**
 * Record a task-specific episode.
 * @param {string} jobId
 * @param {{ phase: string, outcome: string, keyFacts: string[], duration: number }} episode
 */
export async function recordEpisode(jobId, { phase, outcome, keyFacts = [], duration = 0 }) {
  ensureDirs();
  const path = layerPath('episodic', jobId);
  const existing = readJSON(path, { jobId, episodes: [] });
  existing.episodes.push({ id: randomUUID(), phase, outcome, keyFacts, duration, timestamp: new Date().toISOString() });
  writeJSON(path, existing);
}

/**
 * Retrieve episodes optionally filtered by phase/outcome.
 * @param {{ phase?: string, outcome?: string }} filter
 * @returns {Promise<Array<any>>}
 */
export async function getEpisodes(filter = {}) {
  ensureDirs();
  const files = existsSync(EPISODIC)
    ? (await import('fs')).readdirSync(EPISODIC).filter(f => f.endsWith('.json'))
    : [];
  const all = [];
  for (const f of files) {
    const data = readJSON(join(EPISODIC, f), { episodes: [] });
    for (const ep of data.episodes ?? []) {
      if (filter.phase   && ep.phase   !== filter.phase)   continue;
      if (filter.outcome && ep.outcome !== filter.outcome) continue;
      all.push({ jobId: data.jobId, ...ep });
    }
  }
  return all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// ---------------------------------------------------------------------------
// Semantic layer
// ---------------------------------------------------------------------------

/**
 * Store a reusable domain pattern.
 * @param {string} pattern
 * @param {number} confidence  0–1
 */
export async function learnSemantic(pattern, confidence = 0.5) {
  ensureDirs();
  const path = layerPath('semantic', 'patterns');
  const store = readJSON(path, []);
  const existing = store.find(p => p.pattern === pattern);
  if (existing) {
    existing.confidence = Math.min(1, (existing.confidence + confidence) / 2);
    existing.updatedAt  = new Date().toISOString();
    existing.uses++;
  } else {
    store.push({ id: randomUUID(), pattern, confidence, domain: 'general', uses: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  writeJSON(path, store);
}

/**
 * Retrieve patterns for a domain (substring match).
 * @param {string} [domain]
 * @returns {Promise<Array<any>>}
 */
export async function getSemanticPatterns(domain = '') {
  ensureDirs();
  const store = readJSON(layerPath('semantic', 'patterns'), []);
  return domain ? store.filter(p => p.domain?.includes(domain) || p.pattern?.includes(domain)) : store;
}

// ---------------------------------------------------------------------------
// Procedural layer
// ---------------------------------------------------------------------------

/**
 * Update a skill module's improvement log.
 * @param {string} skillName
 * @param {string} improvement
 */
export async function updateProcedural(skillName, improvement) {
  ensureDirs();
  const path = layerPath('procedural', skillName.replace(/[^a-z0-9_-]/gi, '_'));
  const store = readJSON(path, { skillName, improvements: [] });
  store.improvements.push({ improvement, timestamp: new Date().toISOString() });
  store.updatedAt = new Date().toISOString();
  writeJSON(path, store);
}

// ---------------------------------------------------------------------------
// Cross-layer query
// ---------------------------------------------------------------------------

/**
 * Load relevant memories across all 3 layers for a query (simple text match).
 * @param {string} query
 * @returns {Promise<{ episodic: any[], semantic: any[], procedural: string[] }>}
 */
export async function getMemoryContext(query) {
  ensureDirs();
  const q = query.toLowerCase();
  const eps = (await getEpisodes()).filter(e =>
    e.keyFacts?.some(f => f.toLowerCase().includes(q)) || e.phase?.toLowerCase().includes(q)
  ).slice(0, 5);

  const sem = (await getSemanticPatterns()).filter(p =>
    p.pattern?.toLowerCase().includes(q)
  ).slice(0, 5);

  const procDir = PROCEDURAL;
  const procFiles = existsSync(procDir) ? (await import('fs')).readdirSync(procDir).filter(f => f.endsWith('.json')) : [];
  const proc = [];
  for (const f of procFiles) {
    const data = readJSON(join(procDir, f), {});
    if (data.skillName?.toLowerCase().includes(q)) {
      proc.push(data.improvements?.at(-1)?.improvement ?? '');
    }
  }

  return { episodic: eps, semantic: sem, procedural: proc.filter(Boolean) };
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

/**
 * Merge duplicate patterns, prune low-confidence, identify cross-layer patterns.
 * @returns {Promise<{ pruned: number, merged: number }>}
 */
export async function consolidateMemory() {
  ensureDirs();
  const path = layerPath('semantic', 'patterns');
  let store = readJSON(path, []);
  const before = store.length;

  // Prune low confidence
  store = store.filter(p => p.confidence >= 0.2);

  // Merge duplicates (same pattern text)
  const merged = [];
  const seen = new Map();
  for (const p of store) {
    const key = p.pattern.toLowerCase().trim();
    if (seen.has(key)) {
      const existing = seen.get(key);
      existing.confidence = Math.min(1, (existing.confidence + p.confidence) / 2);
      existing.uses += p.uses ?? 1;
    } else {
      seen.set(key, { ...p });
      merged.push(seen.get(key));
    }
  }

  writeJSON(path, merged);
  return { pruned: before - merged.length, merged: store.length - merged.length };
}

export const continuityMemory = {
  recordEpisode, getEpisodes,
  learnSemantic, getSemanticPatterns,
  updateProcedural, getMemoryContext,
  consolidateMemory,
};

export default continuityMemory;
