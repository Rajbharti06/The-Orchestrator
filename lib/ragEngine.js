/**
 * ragEngine.js - 4-Step RAG Pipeline (Ruflo)
 *
 * RETRIEVE→JUDGE→DISTILL→CONSOLIDATE over build history, lessons, instincts, and skills.
 * Uses TF-IDF-inspired cosine scoring since no vector DB is available.
 */

import { getAllLessons } from './lessonStore.js';
import { getAllInstincts } from './instinctStore.js';
import { getBuildHistory } from './memoryStore.js';
import { callLLM } from './llmRouter.js';

async function routeLLM({ task, prompt, maxTokens }) {
  const response = await callLLM({ task, prompt, maxTokens });
  return typeof response === 'string' ? response : response?.content ?? JSON.stringify(response);
}

// ---------------------------------------------------------------------------
// Text scoring helpers (TF-IDF cosine-like)
// ---------------------------------------------------------------------------

function tokenize(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function buildTF(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  const len = tokens.length || 1;
  for (const t in tf) tf[t] /= len;
  return tf;
}

function cosineSimilarity(tfA, tfB) {
  let dot = 0, normA = 0, normB = 0;
  for (const t in tfA) { normA += tfA[t] ** 2; if (tfB[t]) dot += tfA[t] * tfB[t]; }
  for (const t in tfB) normB += tfB[t] ** 2;
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}

function scoreText(query, docText) {
  const qTF  = buildTF(tokenize(query));
  const dTF  = buildTF(tokenize(docText));
  return cosineSimilarity(qTF, dTF);
}

// ---------------------------------------------------------------------------
// Namespace loaders
// ---------------------------------------------------------------------------

async function loadNamespace(namespace) {
  const docs = [];
  try {
    if (namespace === 'all' || namespace === 'lessons') {
      const lessons = getAllLessons();
      for (const l of lessons) docs.push({ source: 'lesson', id: l.id, text: `${l.issue} ${l.cause} ${l.fix}`, raw: l });
    }
    if (namespace === 'all' || namespace === 'instincts') {
      const instincts = getAllInstincts();
      for (const i of instincts) docs.push({ source: 'instinct', id: i.id, text: `${i.pattern} ${i.context}`, raw: i });
    }
    if (namespace === 'all' || namespace === 'builds') {
      const builds = getBuildHistory();
      for (const b of builds) docs.push({ source: 'build', id: b.id, text: `${b.prompt ?? ''} ${b.stack ?? ''}`, raw: b });
    }
  } catch { /* graceful fallback */ }
  return docs;
}

// ---------------------------------------------------------------------------
// RAG steps
// ---------------------------------------------------------------------------

/**
 * RETRIEVE: find top-K relevant memories by text similarity.
 * @param {string} query
 * @param {{ topK?: number, namespace?: string }} opts
 * @returns {Promise<Array<{source: string, id: string, score: number, raw: any}>>}
 */
export async function retrieve(query, { topK = 5, namespace = 'all' } = {}) {
  const docs = await loadNamespace(namespace);
  const scored = docs.map(d => ({ ...d, score: scoreText(query, d.text) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * JUDGE: LLM scores each candidate's relevance (0-1).
 * @param {string} query
 * @param {Array<any>} candidates
 * @returns {Promise<Array<{candidate: any, relevance: number}>>}
 */
export async function judge(query, candidates) {
  if (!candidates.length) return [];
  try {
    const prompt = `Rate each snippet's relevance to the query (0.0–1.0). Return a JSON array of numbers only.\n\nQuery: ${query}\n\nSnippets:\n${candidates.map((c, i) => `[${i}] ${c.text?.slice(0, 200)}`).join('\n')}`;
    const raw = await callLLM({ task: 'qa', prompt, maxTokens: 256 });
    const scores = JSON.parse(raw.match(/\[[\d.,\s]+\]/)?.[0] ?? '[]');
    return candidates.map((c, i) => ({ candidate: c, relevance: scores[i] ?? c.score ?? 0 }));
  } catch {
    return candidates.map(c => ({ candidate: c, relevance: c.score ?? 0 }));
  }
}

/**
 * DISTILL: extract core insight from top judged results.
 * @param {Array<{candidate: any, relevance: number}>} judgedResults
 * @returns {Promise<string>}
 */
export async function distill(judgedResults) {
  const top = judgedResults.filter(r => r.relevance > 0.3).slice(0, 3);
  if (!top.length) return '';
  try {
    const snippets = top.map(r => r.candidate.text?.slice(0, 300)).join('\n---\n');
    const prompt = `Distill these related snippets into ONE concise insight (max 2 sentences):\n\n${snippets}`;
    return await callLLM({ task: 'qa', prompt, maxTokens: 150 });
  } catch {
    return top.map(r => r.candidate.text?.slice(0, 100)).join('; ');
  }
}

/**
 * CONSOLIDATE: merge new insight into existing knowledge (EWC-inspired).
 * @param {string} distilled
 * @param {string} existing
 * @returns {Promise<string>}
 */
export async function consolidate(distilled, existing) {
  if (!existing) return distilled;
  if (!distilled) return existing;
  try {
    const prompt = `Merge these two knowledge snippets without losing prior patterns. If the new insight confidence is low, preserve the old one.\n\nOLD: ${existing}\n\nNEW: ${distilled}\n\nMERGED (1-3 sentences):`;
    return await callLLM({ task: 'qa', prompt, maxTokens: 200 });
  } catch {
    return `${existing}\n${distilled}`;
  }
}

/**
 * Full RETRIEVE→JUDGE→DISTILL→CONSOLIDATE pipeline.
 * @param {string} query
 * @param {{ topK?: number, namespace?: string, existingContext?: string }} opts
 * @returns {Promise<{context: string, sources: any[], confidence: number}>}
 */
export async function ragQuery(query, opts = {}) {
  try {
    const candidates  = await retrieve(query, { topK: opts.topK ?? 5, namespace: opts.namespace ?? 'all' });
    const judged      = await judge(query, candidates);
    const distilled   = await distill(judged);
    const context     = await consolidate(distilled, opts.existingContext ?? '');
    const avgConf     = judged.length ? judged.reduce((s, r) => s + r.relevance, 0) / judged.length : 0;

    return { context, sources: candidates.map(c => ({ source: c.source, id: c.id })), confidence: avgConf };
  } catch (err) {
    return { context: '', sources: [], confidence: 0, error: err.message };
  }
}
