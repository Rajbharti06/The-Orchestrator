/**
 * temporalReasoner.js — EvoReasoner-inspired Temporal Intelligence
 *
 * Research basis:
 * - EvoReasoner (arXiv:2509.15464): temporal-aware reasoning over evolving KG
 *   → +23.3% on temporal reasoning tasks vs baselines
 *   Core insight: facts have validity windows, newer ≠ always correct
 * - EvoKG: noise-tolerant KG evolution with confidence-based contradiction resolution
 * - TempoRAG (2024): retrieval augmented with temporal metadata and decay functions
 * - Temporal Knowledge Graph Completion: entity state snapshots + transition modeling
 * - CHRONOS (2024): time-series pattern recognition for anomaly detection
 *   Extended to event sequence modeling for threat intelligence
 *
 * Key capabilities:
 *   temporalSnapshot()   — reconstruct world state at any point in time
 *   detectDrift()        — find facts that changed significantly over time
 *   forecastTrend()      — project current trends forward (with uncertainty)
 *   timelineAnalysis()   — analyze sequence of events for patterns
 *   temporalQuery()      — query knowledge with time-awareness and decay
 *   anomalyDetect()      — flag temporal anomalies in event sequences
 */

import { callLLM } from './llmRouter.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPORAL_PATH = join(__dirname, '..', 'memory', 'temporal_state.json');

// ---------------------------------------------------------------------------
// In-memory temporal state
// ---------------------------------------------------------------------------
let temporalState = {
  facts: [],     // { id, subject, predicate, value, validFrom, validTo, confidence, source }
  events: [],    // { id, type, description, timestamp, entities, severity, causalPredecessors }
  snapshots: {}, // timestamp → { facts: [...], entities: {...} }
  trends: [],    // { subject, predicate, dataPoints: [{timestamp, value}], lastUpdated }
};

function ensureDir() {
  const dir = join(__dirname, '..', 'memory');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function load() {
  try {
    ensureDir();
    if (existsSync(TEMPORAL_PATH)) temporalState = JSON.parse(readFileSync(TEMPORAL_PATH, 'utf8'));
  } catch { /* fresh start */ }
}

function save() {
  try {
    ensureDir();
    writeFileSync(TEMPORAL_PATH, JSON.stringify(temporalState, null, 2));
  } catch {}
}

load();

// ---------------------------------------------------------------------------
// Fact lifecycle management (EvoReasoner core)
// ---------------------------------------------------------------------------

/**
 * Add a temporally-scoped fact.
 * EvoReasoner: facts have validFrom/validTo windows, not just timestamps.
 * Contradiction resolution: newer higher-confidence facts supersede old ones.
 */
export function addTemporalFact(subject, predicate, value, {
  validFrom = null,
  validTo = null,
  confidence = 0.8,
  source = null,
} = {}) {
  const now = new Date().toISOString();
  const factId = `${subject}-${predicate}-${Date.now()}`;

  // Check for existing active facts with same subject+predicate
  const existing = temporalState.facts.filter(
    f => f.subject === subject && f.predicate === predicate && f.active !== false
  );

  for (const old of existing) {
    const oldConf = old.confidence;
    const newIsNewer = !old.validFrom || new Date(validFrom || now) > new Date(old.validFrom);
    const newIsMoreConfident = confidence > oldConf;

    if (newIsNewer || newIsMoreConfident) {
      old.active = false;
      old.supersededBy = factId;
      old.validTo = validFrom || now; // auto-close the old fact's validity window
    }
  }

  const fact = {
    id: factId,
    subject, predicate, value,
    validFrom: validFrom || now,
    validTo: validTo || null,  // null = still valid
    confidence, source,
    active: true,
    addedAt: now,
  };

  temporalState.facts.push(fact);

  // Update trend tracker
  updateTrend(subject, predicate, value, validFrom || now);

  save();
  return fact;
}

function updateTrend(subject, predicate, value, timestamp) {
  const idx = temporalState.trends.findIndex(
    t => t.subject === subject && t.predicate === predicate
  );
  const point = { timestamp, value };
  if (idx >= 0) {
    temporalState.trends[idx].dataPoints.push(point);
    temporalState.trends[idx].lastUpdated = new Date().toISOString();
  } else {
    temporalState.trends.push({ subject, predicate, dataPoints: [point], lastUpdated: new Date().toISOString() });
  }
}

/**
 * Add a timestamped event with causal predecessors.
 */
export function addEvent(type, description, {
  timestamp = null,
  entities = [],
  severity = 'medium',
  causalPredecessors = [],
  source = null,
} = {}) {
  const event = {
    id: `event-${Date.now()}`,
    type, description,
    timestamp: timestamp || new Date().toISOString(),
    entities, severity, causalPredecessors, source,
  };
  temporalState.events.push(event);
  save();
  return event;
}

// ---------------------------------------------------------------------------
// Temporal snapshot (reconstruct world state at a point in time)
// ---------------------------------------------------------------------------

/**
 * Reconstruct the state of all facts at a specific point in time.
 * EvoReasoner: time-travel through the knowledge graph.
 *
 * @param {string} timestamp  - ISO8601 target time
 * @param {string} [subject]  - Optionally filter by subject
 * @returns {{facts: any[], events: any[], timestamp: string}}
 */
export function temporalSnapshot(timestamp, subject = null) {
  const targetTime = new Date(timestamp).getTime();

  const validFacts = temporalState.facts.filter(f => {
    const validFrom = f.validFrom ? new Date(f.validFrom).getTime() : 0;
    const validTo = f.validTo ? new Date(f.validTo).getTime() : Infinity;
    return validFrom <= targetTime && targetTime <= validTo;
  });

  const priorEvents = temporalState.events.filter(e => {
    return new Date(e.timestamp).getTime() <= targetTime;
  });

  const filtered = subject
    ? { facts: validFacts.filter(f => f.subject === subject), events: priorEvents }
    : { facts: validFacts, events: priorEvents };

  return { ...filtered, timestamp, reconstructedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Temporal drift detection
// ---------------------------------------------------------------------------

/**
 * Detect which facts/entities have changed significantly over a time window.
 * Flags facts where confidence dropped or value changed multiple times.
 *
 * @param {string} since   - ISO8601 start time
 * @param {string} [until] - ISO8601 end time (default: now)
 * @returns {{drifted: any[], stable: any[], volatileEntities: string[]}}
 */
export function detectDrift(since, until = null) {
  const sinceTime = new Date(since).getTime();
  const untilTime = until ? new Date(until).getTime() : Date.now();

  const windowFacts = temporalState.facts.filter(f => {
    const t = new Date(f.addedAt).getTime();
    return t >= sinceTime && t <= untilTime;
  });

  // Group by subject+predicate to find changes
  const groups = {};
  for (const fact of windowFacts) {
    const key = `${fact.subject}::${fact.predicate}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(fact);
  }

  const drifted = [];
  const stable = [];

  for (const [key, facts] of Object.entries(groups)) {
    if (facts.length > 1) {
      const [subject, predicate] = key.split('::');
      const confidenceChange = facts[facts.length - 1].confidence - facts[0].confidence;
      drifted.push({
        subject, predicate,
        changeCount: facts.length,
        confidenceChange: confidenceChange.toFixed(2),
        firstValue: facts[0].value,
        lastValue: facts[facts.length - 1].value,
        changed: facts[0].value !== facts[facts.length - 1].value,
      });
    } else {
      stable.push({ subject: key.split('::')[0], predicate: key.split('::')[1], fact: facts[0] });
    }
  }

  const volatileEntities = [...new Set(drifted.filter(d => d.changed).map(d => d.subject))];

  return { drifted, stable, volatileEntities, windowStart: since, windowEnd: until || new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Trend forecasting
// ---------------------------------------------------------------------------

/**
 * Project current trends forward using LLM-assisted extrapolation.
 * Uses CHRONOS-inspired time-series reasoning.
 *
 * @param {string} subject    - Entity to forecast
 * @param {string} predicate  - Property to forecast
 * @param {string} horizon    - "1week" | "1month" | "1year"
 * @returns {Promise<{forecast: string, confidence: number, scenarios: any[]}>}
 */
export async function forecastTrend(subject, predicate, horizon = '1month') {
  const trendData = temporalState.trends.find(
    t => t.subject === subject && t.predicate === predicate
  );

  if (!trendData || trendData.dataPoints.length < 2) {
    return { forecast: 'Insufficient data for trend analysis', confidence: 0, scenarios: [] };
  }

  const dataPointsText = trendData.dataPoints
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-20)  // last 20 data points
    .map(p => `${p.timestamp.slice(0, 10)}: ${p.value}`)
    .join('\n');

  const prompt = `You are a temporal trend analyst.

Subject: ${subject}
Property: ${predicate}
Historical data points:
${dataPointsText}

Forecast this trend over the next ${horizon}.
Return JSON:
{
  "trend": "increasing|decreasing|stable|cyclical|volatile",
  "forecast": "specific forecast narrative",
  "confidence": 0.0-1.0,
  "scenarios": [
    { "name": "best case", "outcome": "...", "probability": 0.0-1.0 },
    { "name": "most likely", "outcome": "...", "probability": 0.0-1.0 },
    { "name": "worst case", "outcome": "...", "probability": 0.0-1.0 }
  ],
  "keyDrivers": ["what factors drive this trend"],
  "breakingPoints": ["what would cause trend reversal"]
}`;

  try {
    const raw = await callLLM({ task: 'reasoning', prompt, maxTokens: 600 });
    return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  } catch {
    return { forecast: 'Forecast unavailable', confidence: 0, scenarios: [] };
  }
}

// ---------------------------------------------------------------------------
// Timeline analysis (DARPA KAIROS event sequencing)
// ---------------------------------------------------------------------------

/**
 * Analyze a sequence of events for patterns, causal chains, and anomalies.
 * KAIROS-inspired: identify complex event schemas in temporal sequences.
 *
 * @param {string[]} entityFilter  - Only events involving these entities (empty = all)
 * @param {string}   [since]       - ISO8601 start time
 * @param {string}   [until]       - ISO8601 end time
 * @returns {Promise<{timeline: any[], patterns: any[], schema: string}>}
 */
export async function timelineAnalysis(entityFilter = [], since = null, until = null) {
  let events = [...temporalState.events];

  if (since) events = events.filter(e => new Date(e.timestamp) >= new Date(since));
  if (until) events = events.filter(e => new Date(e.timestamp) <= new Date(until));
  if (entityFilter.length > 0) {
    events = events.filter(e =>
      entityFilter.some(entity => e.entities?.some(ent =>
        ent.toLowerCase().includes(entity.toLowerCase())
      ) || e.description?.toLowerCase().includes(entity.toLowerCase()))
    );
  }

  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (events.length === 0) return { timeline: [], patterns: [], schema: 'No events in window' };

  const timelineText = events
    .map(e => `[${e.timestamp.slice(0, 16)}] [${e.severity?.toUpperCase()}] ${e.type}: ${e.description}`)
    .join('\n');

  const prompt = `You are a temporal intelligence analyst.

Event timeline:
${timelineText.slice(0, 3000)}

Analyze this timeline for:
1. Recurring patterns or cycles
2. Causal chains (event A likely caused event B)
3. The underlying event schema (KAIROS-style: what "complex event" is this a part of?)
4. Anomalies: events that break the pattern
5. Predicted next events based on the schema

Return JSON:
{
  "patterns": [
    { "name": "pattern name", "description": "...", "frequency": "daily|weekly|...", "confidence": 0.0-1.0 }
  ],
  "causalChains": [
    { "trigger": "event type", "leads_to": "event type", "delay": "hours|days", "mechanism": "..." }
  ],
  "schema": "name of the overall complex event schema (e.g., 'supply chain attack', 'credential stuffing campaign')",
  "schemaConfidence": 0.0-1.0,
  "anomalies": ["events that don't fit the pattern"],
  "predictedNextEvents": ["what happens next based on the schema"]
}`;

  try {
    const raw = await callLLM({ task: 'reasoning', prompt, maxTokens: 700 });
    const analysis = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return { timeline: events, ...analysis };
  } catch {
    return { timeline: events, patterns: [], schema: 'Analysis failed', anomalies: [], predictedNextEvents: [] };
  }
}

// ---------------------------------------------------------------------------
// Temporal query with confidence decay
// ---------------------------------------------------------------------------

/**
 * Query facts with temporal awareness and exponential confidence decay.
 * EvoReasoner: older facts are less reliable; confidence decays over time.
 *
 * @param {string} subject
 * @param {string} [predicate]
 * @param {Object} [opts]
 * @param {number} [opts.decayDays=90]   - Half-life for confidence decay
 * @param {number} [opts.minConfidence]  - Filter out low-confidence facts
 * @returns {any[]}
 */
export function temporalQuery(subject, predicate = null, { decayDays = 90, minConfidence = 0.2 } = {}) {
  const now = Date.now();
  const halfLifeMs = decayDays * 24 * 60 * 60 * 1000;

  return temporalState.facts
    .filter(f => {
      if (f.active === false) return false;
      if (f.subject !== subject) return false;
      if (predicate && f.predicate !== predicate) return false;
      return true;
    })
    .map(f => {
      // Exponential decay: confidence halves every decayDays
      const ageMs = now - new Date(f.addedAt).getTime();
      const decayFactor = Math.exp(-Math.log(2) * ageMs / halfLifeMs);
      const adjustedConfidence = f.confidence * decayFactor;
      return { ...f, adjustedConfidence, ageMs };
    })
    .filter(f => f.adjustedConfidence >= minConfidence)
    .sort((a, b) => b.adjustedConfidence - a.adjustedConfidence);
}

// ---------------------------------------------------------------------------
// Anomaly detection in event sequences
// ---------------------------------------------------------------------------

/**
 * Detect temporal anomalies in event sequences.
 * CHRONOS-inspired: flag events that break expected patterns.
 *
 * @param {string} [eventType]   - Filter by event type
 * @param {number} [windowDays]  - Look-back window
 * @returns {Promise<{anomalies: any[], baselinePattern: string, riskLevel: string}>}
 */
export async function anomalyDetect(eventType = null, windowDays = 30) {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  let recentEvents = temporalState.events.filter(e => e.timestamp >= cutoff);
  if (eventType) recentEvents = recentEvents.filter(e => e.type === eventType);

  if (recentEvents.length < 3) {
    return { anomalies: [], baselinePattern: 'Insufficient data', riskLevel: 'unknown' };
  }

  const eventSummary = recentEvents
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(e => `${e.timestamp.slice(0, 13)}: [${e.severity}] ${e.type} — ${e.description.slice(0, 80)}`)
    .join('\n');

  const prompt = `You are an anomaly detection system analyzing event sequences.

Events in the last ${windowDays} days:
${eventSummary.slice(0, 2500)}

Detect anomalies:
- Events that cluster unexpectedly (time or type anomalies)
- Events with unusual severity spikes
- Missing expected events (absence anomalies)
- Temporal pattern breaks

Return JSON:
{
  "baselinePattern": "description of the normal pattern",
  "anomalies": [
    {
      "eventId": "the anomalous event description",
      "anomalyType": "spike|cluster|absence|patternBreak",
      "severity": "low|medium|high|critical",
      "explanation": "why this is anomalous"
    }
  ],
  "riskLevel": "low|medium|high|critical",
  "recommendation": "what to investigate first"
}`;

  try {
    const raw = await callLLM({ task: 'fast', prompt, maxTokens: 500 });
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return { anomalies: result.anomalies ?? [], baselinePattern: result.baselinePattern ?? '', riskLevel: result.riskLevel ?? 'unknown', recommendation: result.recommendation ?? '' };
  } catch {
    return { anomalies: [], baselinePattern: 'Analysis failed', riskLevel: 'unknown' };
  }
}

/**
 * Get temporal statistics.
 */
export function getTemporalStats() {
  const activeFacts = temporalState.facts.filter(f => f.active !== false);
  const supersededFacts = temporalState.facts.filter(f => f.active === false);

  return {
    totalFacts: temporalState.facts.length,
    activeFacts: activeFacts.length,
    supersededFacts: supersededFacts.length,
    totalEvents: temporalState.events.length,
    trackedTrends: temporalState.trends.length,
    snapshots: Object.keys(temporalState.snapshots).length,
    entityCount: [...new Set(temporalState.facts.map(f => f.subject))].length,
    oldestFact: temporalState.facts.reduce((min, f) =>
      !min || new Date(f.addedAt) < new Date(min) ? f.addedAt : min, null),
  };
}

export const temporalReasoner = {
  addTemporalFact, addEvent,
  temporalSnapshot, detectDrift,
  forecastTrend, timelineAnalysis,
  temporalQuery, anomalyDetect,
  getTemporalStats,
  getAllFacts: () => temporalState.facts,
  getAllEvents: () => temporalState.events,
};

export default temporalReasoner;
