/**
 * ontologyEngine.js — Palantir Gotham-style Dynamic Ontology
 *
 * Implements the core entity model from Palantir Gotham's Object Model:
 * - Typed entities (person, org, event, artifact, location, concept, threat)
 * - Entity-Link-Property (ELP) methodology (i2 Analyst's Notebook)
 * - Dynamic ontology: schema adapts as new entity types are discovered
 * - Temporal tracking: every entity and link has a validity window
 * - "Search around": BFS/DFS graph traversal to find indirect connections
 * - Object Set Service: query/filter/aggregate/load entities
 *
 * Three ontology layers (Palantir architecture):
 *   SEMANTIC  — static entity definitions and relationship types
 *   KINETIC   — live state of entities (current facts)
 *   DYNAMIC   — temporal changes (how entities evolve over time)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ONTOLOGY_PATH = join(__dirname, '..', 'memory', 'ontology.json');

// ---------------------------------------------------------------------------
// Built-in entity type schema (semantic layer)
// ---------------------------------------------------------------------------
const BUILT_IN_TYPES = {
  person:    { color: '#4a90d9', icon: '👤', properties: ['name', 'role', 'email', 'affiliation'] },
  org:       { color: '#e8873a', icon: '🏢', properties: ['name', 'type', 'domain', 'sector'] },
  event:     { color: '#d94a4a', icon: '⚡', properties: ['name', 'datetime', 'location', 'severity'] },
  artifact:  { color: '#8b5cf6', icon: '📄', properties: ['name', 'type', 'hash', 'source'] },
  location:  { color: '#22c55e', icon: '📍', properties: ['name', 'coordinates', 'country', 'region'] },
  threat:    { color: '#ef4444', icon: '⚠', properties: ['name', 'tactic', 'technique', 'severity', 'mitre'] },
  concept:   { color: '#6b7280', icon: '💡', properties: ['name', 'description', 'domain'] },
  action:    { color: '#f59e0b', icon: '🎯', properties: ['name', 'agent', 'target', 'datetime', 'status'] },
};

const BUILT_IN_RELATIONS = new Set([
  'knows', 'works-for', 'member-of', 'located-at', 'participated-in',
  'caused', 'preceded', 'followed', 'used', 'targeted', 'created',
  'owns', 'communicates-with', 'related-to', 'exploited', 'detected',
  'responds-to', 'contains', 'part-of', 'similar-to', 'correlates-with',
]);

// ---------------------------------------------------------------------------
// In-memory ontology state
// ---------------------------------------------------------------------------
let ontology = {
  entities: {},           // id → entity
  links: [],              // [{id, from, to, relation, timestamp, confidence, evidence}]
  customTypes: {},        // user-defined entity types
  stats: { entities: 0, links: 0, queries: 0 },
};

function ensureDir() {
  const dir = join(__dirname, '..', 'memory');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function load() {
  try {
    ensureDir();
    if (existsSync(ONTOLOGY_PATH)) {
      ontology = { ...ontology, ...JSON.parse(readFileSync(ONTOLOGY_PATH, 'utf8')) };
    }
  } catch { /* fresh start */ }
}

function save() {
  try {
    ensureDir();
    writeFileSync(ONTOLOGY_PATH, JSON.stringify(ontology, null, 2));
  } catch { /* non-critical */ }
}

load();

// ---------------------------------------------------------------------------
// Entity operations (Semantic + Kinetic layer)
// ---------------------------------------------------------------------------

/**
 * Add or update an entity in the ontology.
 * Dynamic: if the type doesn't exist, it is auto-created.
 */
function addEntity({ id, name, type, properties = {}, confidence = 0.8, source = null, timestamp = null }) {
  const entityId = id || `${type}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
  const now = new Date().toISOString();

  // Auto-expand ontology for unknown types (dynamic layer)
  if (!BUILT_IN_TYPES[type] && !ontology.customTypes[type]) {
    ontology.customTypes[type] = {
      color: '#94a3b8',
      icon: '❓',
      properties: Object.keys(properties),
      discoveredAt: now,
    };
  }

  if (ontology.entities[entityId]) {
    // Merge: update properties, track history
    const existing = ontology.entities[entityId];
    existing.properties = { ...existing.properties, ...properties };
    existing.confidence = Math.max(existing.confidence, confidence);
    existing.updatedAt = now;
    if (!existing.history) existing.history = [];
    existing.history.push({ timestamp: now, event: 'updated', source });
  } else {
    ontology.entities[entityId] = {
      id: entityId, name, type, properties, confidence, source,
      createdAt: timestamp || now, updatedAt: now,
      history: [{ timestamp: now, event: 'created', source }],
    };
    ontology.stats.entities++;
  }

  save();
  return ontology.entities[entityId];
}

/**
 * Add a typed link between two entities.
 */
function addLink({ from, to, relation, timestamp = null, confidence = 0.8, evidence = '', bidirectional = false }) {
  const now = new Date().toISOString();
  const linkId = randomUUID();

  const link = { id: linkId, from, to, relation, timestamp: timestamp || now, confidence, evidence, bidirectional };
  ontology.links.push(link);
  ontology.stats.links++;

  if (bidirectional) {
    ontology.links.push({ ...link, id: randomUUID(), from: to, to: from });
  }

  save();
  return link;
}

// ---------------------------------------------------------------------------
// "Search around" — BFS graph traversal (Palantir's core intelligence primitive)
// ---------------------------------------------------------------------------

/**
 * Find all entities connected to a focus entity within N hops.
 * Implements Palantir Gotham's "search around" capability:
 * Person A → attended same event → as Person B (2-hop indirect connection)
 *
 * @param {string} entityId   - Starting entity ID or name
 * @param {number} [maxHops=2]
 * @param {string} [relationFilter] - Only follow specific relation types
 * @returns {{connected: any[], paths: any[], hops: number}}
 */
function searchAround(entityId, maxHops = 2, relationFilter = null) {
  ontology.stats.queries++;

  // Resolve by name if not found by ID
  let startId = entityId;
  if (!ontology.entities[startId]) {
    const byName = Object.values(ontology.entities).find(e =>
      e.name.toLowerCase() === entityId.toLowerCase()
    );
    if (byName) startId = byName.id;
    else return { connected: [], paths: [], hops: 0 };
  }

  const visited = new Set([startId]);
  const queue = [{ id: startId, path: [], hop: 0 }];
  const connected = [];
  const paths = [];

  while (queue.length > 0) {
    const { id, path, hop } = queue.shift();
    if (hop >= maxHops) continue;

    const outgoingLinks = ontology.links.filter(l => {
      const matchesSrc = l.from === id;
      const matchesRel = !relationFilter || l.relation === relationFilter;
      return matchesSrc && matchesRel;
    });

    for (const link of outgoingLinks) {
      if (visited.has(link.to)) continue;
      visited.add(link.to);

      const targetEntity = ontology.entities[link.to];
      if (!targetEntity) continue;

      const currentPath = [...path, { entity: ontology.entities[id]?.name, via: link.relation, confidence: link.confidence }];
      connected.push({ entity: targetEntity, hop: hop + 1, via: link.relation, confidence: link.confidence });
      paths.push({ from: startId, to: link.to, path: currentPath, hops: hop + 1 });

      queue.push({ id: link.to, path: currentPath, hop: hop + 1 });
    }
  }

  return { connected, paths, hops: maxHops, focusEntity: startId };
}

// ---------------------------------------------------------------------------
// Object Set Service — query/filter/aggregate
// ---------------------------------------------------------------------------

/**
 * Query entities like Palantir's Object Set Service.
 *
 * @param {Object} query
 * @param {string}  [query.type]            - Filter by entity type
 * @param {string}  [query.nameContains]    - Filter by name substring
 * @param {number}  [query.minConfidence]   - Minimum confidence threshold
 * @param {Object}  [query.properties]      - Match specific property values
 * @param {string}  [query.since]           - Only entities updated since ISO timestamp
 * @param {number}  [query.limit=50]        - Max results
 * @returns {any[]}
 */
function queryObjects({ type, nameContains, minConfidence = 0, properties = {}, since, limit = 50 } = {}) {
  ontology.stats.queries++;
  let results = Object.values(ontology.entities);

  if (type) results = results.filter(e => e.type === type);
  if (nameContains) results = results.filter(e => e.name.toLowerCase().includes(nameContains.toLowerCase()));
  if (minConfidence > 0) results = results.filter(e => e.confidence >= minConfidence);
  if (since) results = results.filter(e => new Date(e.updatedAt) >= new Date(since));
  if (Object.keys(properties).length > 0) {
    results = results.filter(e =>
      Object.entries(properties).every(([k, v]) => e.properties?.[k] === v)
    );
  }

  return results
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

/**
 * Build a timeline of events for a specific entity.
 * Implements temporal reasoning — reconstructs the sequence of facts.
 */
function buildTimeline(entityId) {
  const entity = ontology.entities[entityId];
  if (!entity) return [];

  // Collect all links involving this entity
  const relatedLinks = ontology.links
    .filter(l => l.from === entityId || l.to === entityId)
    .filter(l => l.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return relatedLinks.map(link => {
    const otherId = link.from === entityId ? link.to : link.from;
    const other = ontology.entities[otherId];
    const direction = link.from === entityId ? 'outgoing' : 'incoming';
    return {
      timestamp: link.timestamp,
      event: `${direction === 'outgoing' ? entity.name + ' ' + link.relation + ' ' + other?.name : other?.name + ' ' + link.relation + ' ' + entity.name}`,
      relation: link.relation,
      otherEntity: other,
      confidence: link.confidence,
      evidence: link.evidence,
      direction,
    };
  });
}

/**
 * Detect clusters of densely connected entities (community detection).
 * Simple implementation: find entities sharing 2+ connections.
 */
function detectClusters(minLinks = 2) {
  const entityLinkCount = {};
  for (const link of ontology.links) {
    entityLinkCount[link.from] = (entityLinkCount[link.from] || 0) + 1;
    entityLinkCount[link.to]   = (entityLinkCount[link.to] || 0) + 1;
  }

  const highDegree = Object.entries(entityLinkCount)
    .filter(([, count]) => count >= minLinks)
    .map(([id, count]) => ({ entity: ontology.entities[id], degree: count }))
    .filter(x => x.entity)
    .sort((a, b) => b.degree - a.degree);

  return highDegree;
}

/**
 * Get ontology statistics and schema summary.
 */
function getOntologySchema() {
  const typeCounts = {};
  for (const entity of Object.values(ontology.entities)) {
    typeCounts[entity.type] = (typeCounts[entity.type] || 0) + 1;
  }

  return {
    stats:        ontology.stats,
    entityTypes:  { ...BUILT_IN_TYPES, ...ontology.customTypes },
    typeCounts,
    relationTypes: [...BUILT_IN_RELATIONS],
    totalLinks:   ontology.links.length,
    totalEntities: Object.keys(ontology.entities).length,
  };
}

/**
 * Reset the ontology (for testing or fresh starts).
 */
function reset() {
  ontology = { entities: {}, links: [], customTypes: {}, stats: { entities: 0, links: 0, queries: 0 } };
  save();
}

export const ontologyEngine = {
  addEntity, addLink, searchAround, queryObjects,
  buildTimeline, detectClusters, getOntologySchema, reset,
  getEntity: (id) => ontology.entities[id],
  getAllLinks: () => ontology.links,
};

export default ontologyEngine;
