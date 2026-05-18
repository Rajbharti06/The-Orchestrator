/**
 * knowledgeGraph.js — HippoRAG 2 + Microsoft GraphRAG inspired KG
 *
 * Research basis:
 * - HippoRAG 2 (arXiv:2502.14802, ICML '25): neocortex + KG + Personalized PageRank
 *   → 7-point F1 gain on multi-hop QA, significantly fewer LLM tokens
 * - Microsoft GraphRAG (microsoft/graphrag): Leiden community detection,
 *   hierarchical summaries, answers questions requiring whole-dataset synthesis
 * - EvoReasoner (arXiv:2509.15464): temporal-aware reasoning over evolving KG
 *   → +23.3% on temporal reasoning tasks
 *
 * Architecture:
 *   Offline:  LLM extracts (subject, predicate, object, timestamp) triples
 *             from text → stored in KG
 *   Online:   Query → embedding retrieval → Personalized PageRank → ranked context
 *   Evolving: Contradiction resolution (newer fact wins unless confidence lower)
 *             + temporal trend tracking
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callLLM } from './llmRouter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KG_PATH = join(__dirname, '..', 'memory', 'knowledge_graph.json');

// ---------------------------------------------------------------------------
// In-memory KG state
// ---------------------------------------------------------------------------
let kg = {
  triples: [],    // { id, subject, predicate, object, timestamp, confidence, source }
  entities: {},   // entity → { aliases, type, mentions }
  communities: [], // Leiden-inspired clusters
};

function ensureDir() {
  const dir = join(__dirname, '..', 'memory');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function load() {
  try {
    ensureDir();
    if (existsSync(KG_PATH)) kg = JSON.parse(readFileSync(KG_PATH, 'utf8'));
  } catch { /* fresh start */ }
}

function save() {
  try {
    ensureDir();
    writeFileSync(KG_PATH, JSON.stringify(kg, null, 2));
  } catch {}
}

load();

// ---------------------------------------------------------------------------
// Triple operations
// ---------------------------------------------------------------------------

/**
 * Add a (subject, predicate, object) triple to the KG.
 * EvoReasoner: newer facts override old ones via confidence-based contradiction resolution.
 */
export function addTriple(subject, predicate, object, { timestamp = null, confidence = 0.8, source = null } = {}) {
  const now = timestamp || new Date().toISOString();

  // Contradiction resolution: if same subject+predicate pair exists, keep higher confidence
  const existing = kg.triples.findIndex(
    t => t.subject === subject && t.predicate === predicate && t.object === object
  );

  if (existing >= 0) {
    if (confidence > kg.triples[existing].confidence) {
      kg.triples[existing] = { ...kg.triples[existing], confidence, timestamp: now, source };
    }
    save();
    return kg.triples[existing];
  }

  // Check for contradictory facts (same subject+predicate, different object)
  const contradictory = kg.triples.findIndex(
    t => t.subject === subject && t.predicate === predicate && t.object !== object
  );

  const triple = {
    id: `${subject}-${predicate}-${object}-${Date.now()}`,
    subject, predicate, object, timestamp: now, confidence, source,
  };

  if (contradictory >= 0) {
    // EvoReasoner: newer, higher-confidence fact wins
    const old = kg.triples[contradictory];
    if (confidence > old.confidence || new Date(now) > new Date(old.timestamp)) {
      old.supersededBy = triple.id;
      old.active = false;
    }
  }

  kg.triples.push(triple);

  // Update entity registry
  for (const entity of [subject, object]) {
    if (!kg.entities[entity]) kg.entities[entity] = { aliases: [], type: null, mentions: 0 };
    kg.entities[entity].mentions++;
  }

  save();
  return triple;
}

/**
 * Add a complete entity node with metadata.
 */
export function addEntity({ id, name, type, properties = {}, confidence = 0.8 }) {
  const entityKey = name.toLowerCase();
  if (!kg.entities[entityKey]) {
    kg.entities[entityKey] = { aliases: [name], type, properties, mentions: 0, confidence, id };
  } else {
    kg.entities[entityKey].mentions++;
    kg.entities[entityKey].confidence = Math.max(kg.entities[entityKey].confidence, confidence);
  }
  save();
  return kg.entities[entityKey];
}

// ---------------------------------------------------------------------------
// LLM-based triple extraction from text (offline phase)
// ---------------------------------------------------------------------------

/**
 * Extract (subject, predicate, object, timestamp) triples from raw text.
 * HippoRAG 2 pattern: LLM extracts triples + confidence scores.
 *
 * @param {string} text   - Raw text to extract from
 * @param {string} [source]
 * @returns {Promise<Array<{subject, predicate, object, timestamp, confidence}>>}
 */
export async function extractTriples(text, source = null) {
  if (!text || text.length < 20) return [];

  try {
    const prompt = `Extract knowledge graph triples from this text.
Each triple: (subject, predicate, object) with optional timestamp and confidence.

Text:
${text.slice(0, 2000)}

Extract ALL factual relationships. Return JSON only:
{
  "triples": [
    {
      "subject": "entity name",
      "predicate": "relationship verb",
      "object": "entity or value",
      "timestamp": "ISO8601 if mentioned, else null",
      "confidence": 0.6-1.0
    }
  ]
}`;

    const raw = await callLLM({ task: 'fast', prompt, maxTokens: 800 });
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    const triples = result.triples ?? [];

    for (const triple of triples) {
      if (triple.subject && triple.predicate && triple.object) {
        addTriple(triple.subject, triple.predicate, triple.object, {
          timestamp:  triple.timestamp,
          confidence: triple.confidence ?? 0.75,
          source,
        });
      }
    }

    return triples;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Personalized PageRank (HippoRAG 2's core retrieval mechanism)
// ---------------------------------------------------------------------------

/**
 * Score entities by relevance to a query using Personalized PageRank.
 * Spreads relevance signal from query-matched entities through the graph.
 *
 * @param {string[]} seedEntities - Entities directly mentioned in query
 * @param {number}   [dampingFactor=0.85]
 * @param {number}   [iterations=20]
 * @returns {Map<string, number>} entity → relevance score
 */
export function personalizedPageRank(seedEntities, dampingFactor = 0.85, iterations = 20) {
  const entities = Object.keys(kg.entities);
  if (entities.length === 0) return new Map();

  // Build adjacency: entity → [connected entities with weights]
  const adj = new Map();
  for (const entity of entities) adj.set(entity, []);

  for (const triple of kg.triples.filter(t => t.active !== false)) {
    if (!adj.has(triple.subject)) adj.set(triple.subject, []);
    if (!adj.has(triple.object))  adj.set(triple.object, []);
    adj.get(triple.subject).push({ entity: triple.object, weight: triple.confidence });
    adj.get(triple.object).push({ entity: triple.subject, weight: triple.confidence * 0.7 }); // undirected
  }

  // Initialize scores
  const scores = new Map();
  const seedSet = new Set(seedEntities.map(e => e.toLowerCase()));
  for (const entity of adj.keys()) {
    scores.set(entity, seedSet.has(entity.toLowerCase()) ? 1.0 / (seedEntities.length || 1) : 0);
  }

  // Power iteration
  for (let i = 0; i < iterations; i++) {
    const newScores = new Map();
    for (const entity of adj.keys()) {
      const neighbors = adj.get(entity) ?? [];
      const totalWeight = neighbors.reduce((s, n) => s + n.weight, 0) || 1;
      const incoming = neighbors.reduce((sum, n) => {
        const neighborScore = scores.get(n.entity) ?? 0;
        const neighborOut = (adj.get(n.entity) ?? []).reduce((s, x) => s + x.weight, 0) || 1;
        return sum + (neighborScore * n.weight / neighborOut);
      }, 0);

      const personalScore = seedSet.has(entity.toLowerCase()) ? 1.0 / (seedEntities.length || 1) : 0;
      newScores.set(entity, (1 - dampingFactor) * personalScore + dampingFactor * incoming);
    }
    for (const [entity, score] of newScores) scores.set(entity, score);
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Graph-based query (online retrieval phase)
// ---------------------------------------------------------------------------

/**
 * Retrieve relevant context from KG for a query.
 * HippoRAG 2 pattern: extract query entities → PPR → top-scored triples → context.
 *
 * @param {string} query
 * @param {number} [topK=8]
 * @returns {Promise<{context: string, entities: string[], triples: any[], confidence: number}>}
 */
export async function queryKG(query, topK = 8) {
  if (kg.triples.length === 0) return { context: '', entities: [], triples: [], confidence: 0 };

  // Extract query entities
  let queryEntities = [];
  try {
    const prompt = `Extract named entities from this query (names, places, concepts, technologies):
Query: ${query}
Return JSON: { "entities": ["entity1", "entity2"] }`;
    const raw = await callLLM({ task: 'fast', prompt, maxTokens: 200 });
    queryEntities = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}').entities ?? [];
  } catch { queryEntities = []; }

  // Personalized PageRank
  const scores = personalizedPageRank(queryEntities);

  // Score and rank triples
  const scoredTriples = kg.triples
    .filter(t => t.active !== false)
    .map(t => ({
      ...t,
      relevance: (scores.get(t.subject) ?? 0) + (scores.get(t.object) ?? 0),
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, topK);

  // Format as natural language context
  const context = scoredTriples
    .map(t => `${t.subject} ${t.predicate} ${t.object}${t.timestamp ? ` (${t.timestamp.slice(0, 10)})` : ''} [conf:${(t.confidence * 100).toFixed(0)}%]`)
    .join('\n');

  const avgConf = scoredTriples.length
    ? scoredTriples.reduce((s, t) => s + t.confidence, 0) / scoredTriples.length
    : 0;

  return {
    context,
    entities: queryEntities,
    triples: scoredTriples,
    confidence: avgConf,
    pprScores: Object.fromEntries([...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)),
  };
}

// ---------------------------------------------------------------------------
// Community detection (GraphRAG Leiden-inspired)
// ---------------------------------------------------------------------------

/**
 * Detect entity communities by shared relationships.
 * GraphRAG: generates hierarchical summaries of each community.
 */
export function detectCommunities() {
  // Build adjacency
  const adj = {};
  for (const triple of kg.triples.filter(t => t.active !== false)) {
    if (!adj[triple.subject]) adj[triple.subject] = new Set();
    if (!adj[triple.object])  adj[triple.object] = new Set();
    adj[triple.subject].add(triple.object);
    adj[triple.object].add(triple.subject);
  }

  // Simple connected components (proxy for Leiden)
  const visited = new Set();
  const communities = [];

  for (const entity of Object.keys(adj)) {
    if (visited.has(entity)) continue;
    const community = [];
    const queue = [entity];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      community.push(current);
      for (const neighbor of adj[current] ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    if (community.length >= 2) {
      communities.push({
        id: `community-${communities.length}`,
        entities: community,
        size: community.length,
        density: community.length / Object.keys(adj).length,
      });
    }
  }

  kg.communities = communities.sort((a, b) => b.size - a.size);
  save();
  return communities;
}

/**
 * Generate a summary for a community using an LLM (GraphRAG pattern).
 */
export async function summarizeCommunity(communityId) {
  const community = kg.communities.find(c => c.id === communityId);
  if (!community) return '';

  const relatedTriples = kg.triples
    .filter(t => community.entities.includes(t.subject) && community.entities.includes(t.object))
    .slice(0, 20);

  if (relatedTriples.length === 0) return `Community of ${community.size} entities.`;

  const triplesText = relatedTriples
    .map(t => `${t.subject} ${t.predicate} ${t.object}`)
    .join('\n');

  try {
    const prompt = `Summarize this community of connected entities in 2-3 sentences:

Entities: ${community.entities.slice(0, 10).join(', ')}
Relationships:
${triplesText}

Summary (focus on what this group has in common and why they're connected):`;

    return await callLLM({ task: 'fast', prompt, maxTokens: 200 });
  } catch {
    return `Group of ${community.size} interconnected entities including ${community.entities.slice(0, 3).join(', ')}.`;
  }
}

// ---------------------------------------------------------------------------
// Temporal reasoning (EvoReasoner pattern)
// ---------------------------------------------------------------------------

/**
 * Query the KG for facts valid at a specific point in time.
 * EvoReasoner: temporal-aware fact retrieval with confidence decay.
 */
export function queryAtTime(query, timestamp) {
  const targetTime = new Date(timestamp).getTime();

  return kg.triples
    .filter(t => {
      if (t.active === false) return false;
      if (!t.timestamp) return true; // undated facts are always valid
      const tripleTime = new Date(t.timestamp).getTime();
      return tripleTime <= targetTime;
    })
    .filter(t => {
      const text = `${t.subject} ${t.predicate} ${t.object}`.toLowerCase();
      const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      return words.some(w => text.includes(w));
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Get KG statistics.
 */
export function getStats() {
  return {
    totalTriples: kg.triples.length,
    activeTriples: kg.triples.filter(t => t.active !== false).length,
    totalEntities: Object.keys(kg.entities).length,
    communities: kg.communities.length,
    topEntities: Object.entries(kg.entities)
      .sort((a, b) => b[1].mentions - a[1].mentions)
      .slice(0, 10)
      .map(([name, data]) => ({ name, mentions: data.mentions, type: data.type })),
  };
}

export const knowledgeGraph = {
  addTriple, addEntity, extractTriples,
  queryKG, personalizedPageRank,
  detectCommunities, summarizeCommunity,
  queryAtTime, getStats,
  getAllTriples: () => kg.triples,
};

export default knowledgeGraph;
