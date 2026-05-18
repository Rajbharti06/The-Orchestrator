/**
 * causalEngine.js — Causal Cartographer + CRAwDAD + A2P Causal Inference
 *
 * Research basis:
 * - Causal Cartographer (arXiv:2505.14396): graphRAG extracts causal relationships
 *   from documents → counterfactual agent answers "what-if" questions
 * - CRAwDAD (arXiv:2504.17445): dual-agent causal debate, 67.94% → 80.04% accuracy
 *   Critic challenges Reasoner's causal claims; they debate until consensus
 * - A2P (Abduct-Act-Predict, arXiv:2509.10401): 3-step causal planning scaffolding
 *   Abduct → Act → Predict; superior to CoT on causal tasks
 * - Pearl's Ladder of Causation: Observe → Intervene → Counterfactual
 * - Structural Causal Models (SCMs): variables + mechanisms + noise terms
 *
 * Architecture:
 *   extractCausalGraph()   — build causal DAG from text (Causal Cartographer)
 *   dualAgentDebate()      — CRAwDAD reasoner/critic loop for causal accuracy
 *   abductActPredict()     — A2P three-step causal planning (the EXECUTE engine)
 *   counterfactual()       — "What if X had been different?" reasoning
 *   interventionEffect()   — Do-calculus: effect of forcing a variable
 *   causalChain()          — Trace causal path between two events/entities
 */

import { callLLM } from './llmRouter.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAUSAL_PATH = join(__dirname, '..', 'memory', 'causal_graph.json');

// ---------------------------------------------------------------------------
// In-memory causal graph
// ---------------------------------------------------------------------------
let causalState = {
  nodes: {},  // id → { id, label, type, description, baseRate }
  edges: [],  // { from, to, mechanism, strength, delay, evidence, bidirectional }
  interventions: [],  // logged do-calculus operations
  counterfactuals: [], // logged what-if queries
};

function ensureDir() {
  const dir = join(__dirname, '..', 'memory');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function load() {
  try {
    ensureDir();
    if (existsSync(CAUSAL_PATH)) causalState = JSON.parse(readFileSync(CAUSAL_PATH, 'utf8'));
  } catch { /* fresh start */ }
}

function save() {
  try {
    ensureDir();
    writeFileSync(CAUSAL_PATH, JSON.stringify(causalState, null, 2));
  } catch {}
}

load();

// ---------------------------------------------------------------------------
// Causal graph construction (Causal Cartographer pattern)
// ---------------------------------------------------------------------------

/**
 * Extract a causal DAG from text using LLM.
 * Causal Cartographer: finds "X causes Y" relationships with mechanisms and strengths.
 *
 * @param {string} text
 * @param {string} [source]
 * @returns {Promise<{nodes: any[], edges: any[]}>}
 */
export async function extractCausalGraph(text, source = null) {
  if (!text || text.length < 30) return { nodes: [], edges: [] };

  try {
    const prompt = `Extract causal relationships from this text.
Focus on: what causes what, mechanisms, delays, and strengths.

Text:
${text.slice(0, 2000)}

Return JSON only:
{
  "nodes": [
    { "id": "short_id", "label": "event or variable name", "type": "event|variable|state|action", "description": "brief description" }
  ],
  "edges": [
    {
      "from": "node_id",
      "to": "node_id",
      "mechanism": "how/why this causes that",
      "strength": 0.1-1.0,
      "delay": "immediate|hours|days|weeks|null",
      "evidence": "quote from text supporting this causal link"
    }
  ]
}`;

    const raw = await callLLM({ task: 'reasoning', prompt, maxTokens: 1000 });
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

    const nodes = result.nodes ?? [];
    const edges = result.edges ?? [];

    for (const node of nodes) {
      if (node.id && node.label) {
        causalState.nodes[node.id] = { ...node, source, addedAt: new Date().toISOString() };
      }
    }

    for (const edge of edges) {
      if (edge.from && edge.to && causalState.nodes[edge.from] && causalState.nodes[edge.to]) {
        const exists = causalState.edges.find(e => e.from === edge.from && e.to === edge.to);
        if (!exists) {
          causalState.edges.push({ ...edge, source, addedAt: new Date().toISOString() });
        }
      }
    }

    save();
    return { nodes, edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}

// ---------------------------------------------------------------------------
// CRAwDAD: Dual-agent causal debate
// ---------------------------------------------------------------------------

/**
 * Dual-agent debate to validate a causal claim.
 * CRAwDAD pattern: Reasoner proposes causal explanation → Critic challenges →
 * they debate up to maxRounds → consensus or final arbiter.
 *
 * Accuracy improvement: 67.94% → 80.04% on causal benchmark.
 *
 * @param {string} claim   - Causal claim to validate ("X causes Y because...")
 * @param {string} context - Supporting evidence/context
 * @param {number} [maxRounds=3]
 * @returns {Promise<{verdict: 'supported'|'refuted'|'uncertain', confidence: number, finalReasoning: string, debate: any[]}>}
 */
export async function dualAgentDebate(claim, context = '', maxRounds = 3) {
  const debate = [];
  let reasonerPosition = claim;
  let criticChallenge = '';

  for (let round = 0; round < maxRounds; round++) {
    // Reasoner: defend or refine the causal claim
    const reasonerPrompt = `You are a causal reasoning expert (Reasoner).
Your current causal claim: "${reasonerPosition}"
${criticChallenge ? `Critic's challenge: "${criticChallenge}"` : ''}
Context: ${context.slice(0, 1500)}

Defend or refine your causal claim. Address the critic's points.
Be specific about: (1) the mechanism, (2) confounders you've controlled for, (3) evidence.
Response (2-3 sentences):`;

    const reasonerResponse = await callLLM({ task: 'reasoning', prompt: reasonerPrompt, maxTokens: 300 });

    // Critic: challenge the causal claim
    const criticPrompt = `You are a skeptical causal critic.
Causal claim being defended: "${reasonerResponse}"
Context: ${context.slice(0, 1500)}

Challenge this claim. Look for:
- Reverse causation (Y causes X, not X→Y)
- Confounding variables
- Missing mechanism
- Selection bias
- Spurious correlation

Strongest objection (2-3 sentences):`;

    const criticResponse = await callLLM({ task: 'fast', prompt: criticPrompt, maxTokens: 250 });

    debate.push({
      round: round + 1,
      reasoner: reasonerResponse,
      critic: criticResponse,
    });

    reasonerPosition = reasonerResponse;
    criticChallenge = criticResponse;
  }

  // Final arbiter: synthesize verdict
  const debateText = debate.map(d =>
    `Round ${d.round}\nReasoner: ${d.reasoner}\nCritic: ${d.critic}`
  ).join('\n\n');

  const verdictPrompt = `You are a neutral causal inference judge.

Original claim: "${claim}"
Debate:
${debateText}

Render a final verdict.
Return JSON: { "verdict": "supported|refuted|uncertain", "confidence": 0.0-1.0, "finalReasoning": "2-sentence summary of why" }`;

  const raw = await callLLM({ task: 'reasoning', prompt: verdictPrompt, maxTokens: 300 });
  const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

  return {
    verdict: result.verdict ?? 'uncertain',
    confidence: result.confidence ?? 0.5,
    finalReasoning: result.finalReasoning ?? '',
    debate,
    originalClaim: claim,
  };
}

// ---------------------------------------------------------------------------
// A2P: Abduct-Act-Predict (causal planning scaffolding)
// ---------------------------------------------------------------------------

/**
 * Three-step causal planning via A2P scaffolding.
 * Abduct → Act → Predict.
 *
 * @param {string} situation   - Current situation / problem description
 * @param {string} goal        - Desired outcome
 * @param {string} [context]   - Background context
 * @returns {Promise<{abduction: any, actions: any[], prediction: any, causalChain: string}>}
 */
export async function abductActPredict(situation, goal, context = '') {
  // Step 1: ABDUCT — infer hidden factors causing the situation
  const abductPrompt = `You are a causal reasoning expert using abductive inference.

Situation: ${situation}
Goal: ${goal}
Context: ${context.slice(0, 1000)}

ABDUCT: Identify the hidden factors and root causes most likely producing this situation.
Return JSON:
{
  "rootCauses": ["cause1", "cause2"],
  "hiddenFactors": ["latent factor 1", "latent factor 2"],
  "confounders": ["confounder that might mislead us"],
  "confidence": 0.0-1.0,
  "reasoning": "why these are the most likely causes"
}`;

  const abductRaw = await callLLM({ task: 'reasoning', prompt: abductPrompt, maxTokens: 500 });
  const abduction = JSON.parse(abductRaw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

  // Step 2: ACT — design minimal corrective interventions
  const actPrompt = `You are a causal intervention planner.

Situation: ${situation}
Goal: ${goal}
Root causes identified: ${JSON.stringify(abduction.rootCauses ?? [])}
Hidden factors: ${JSON.stringify(abduction.hiddenFactors ?? [])}

ACT: Design minimal interventions that address root causes (not symptoms).
For each action, specify which root cause it targets.
Return JSON:
{
  "actions": [
    {
      "action": "specific action to take",
      "targetsCause": "which root cause this addresses",
      "mechanism": "how this action breaks the causal chain",
      "sideEffects": ["possible unintended consequences"],
      "priority": 1-10,
      "effort": "low|medium|high"
    }
  ],
  "interventionStrategy": "overall approach"
}`;

  const actRaw = await callLLM({ task: 'reasoning', prompt: actPrompt, maxTokens: 600 });
  const actResult = JSON.parse(actRaw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

  // Step 3: PREDICT — simulate counterfactual trajectory after interventions
  const actions = actResult.actions ?? [];
  const predictPrompt = `You are a causal trajectory predictor.

Original situation: ${situation}
Goal: ${goal}
Planned interventions: ${actions.map(a => a.action).join('; ')}

PREDICT: Simulate what happens after these interventions.
Return JSON:
{
  "immediateEffects": ["what changes right away"],
  "secondOrderEffects": ["downstream effects in days/weeks"],
  "goalAchievement": 0.0-1.0,
  "failureModes": [
    { "scenario": "what could go wrong", "probability": 0.0-1.0, "mitigation": "how to prevent" }
  ],
  "counterfactualBaseline": "what would happen without any intervention",
  "causalChain": "step-by-step causal narrative from intervention to goal"
}`;

  const predictRaw = await callLLM({ task: 'reasoning', prompt: predictPrompt, maxTokens: 700 });
  const prediction = JSON.parse(predictRaw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

  return {
    abduction,
    actions,
    prediction,
    causalChain: prediction.causalChain ?? '',
    goalAchievement: prediction.goalAchievement ?? 0.5,
    interventionStrategy: actResult.interventionStrategy ?? '',
  };
}

// ---------------------------------------------------------------------------
// Counterfactual reasoning (Pearl's Ladder Level 3)
// ---------------------------------------------------------------------------

/**
 * Answer "What if X had been different?" questions.
 * Implements Pearl's counterfactual reasoning (Level 3 of Causation).
 *
 * @param {string} actualWorld    - Description of what actually happened
 * @param {string} counterfactual - The "what if" change to make
 * @param {string} [context]
 * @returns {Promise<{counterfactualOutcome: string, delta: string, confidence: number, reasoning: string}>}
 */
export async function counterfactual(actualWorld, counterfactualChange, context = '') {
  const prompt = `You are a counterfactual reasoning expert using Pearl's do-calculus.

Actual world: ${actualWorld}
Counterfactual change: "${counterfactualChange}"
Context: ${context.slice(0, 1000)}

Using structural causal model reasoning:
1. Identify the variables affected by the change
2. Propagate effects through the causal graph
3. Determine the counterfactual outcome

Return JSON:
{
  "counterfactualOutcome": "what would have happened",
  "affectedVariables": ["list of variables that change"],
  "causalPath": "how the change propagates step by step",
  "delta": "key difference between actual and counterfactual world",
  "confidence": 0.0-1.0,
  "caveats": ["assumptions or limitations"],
  "reasoning": "why this counterfactual outcome is most likely"
}`;

  try {
    const raw = await callLLM({ task: 'reasoning', prompt, maxTokens: 600 });
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

    causalState.counterfactuals.push({
      actualWorld,
      counterfactualChange,
      result,
      timestamp: new Date().toISOString(),
    });
    save();

    return result;
  } catch {
    return {
      counterfactualOutcome: 'Unable to determine',
      delta: '',
      confidence: 0,
      reasoning: 'Causal inference failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Intervention effect (do-calculus)
// ---------------------------------------------------------------------------

/**
 * Estimate effect of forcing a variable to a specific value.
 * Implements Pearl's do-calculus: P(Y | do(X = x)).
 *
 * @param {string} intervention  - "Set X to value V" or "Force A to happen"
 * @param {string} outcome       - What outcome to measure
 * @param {string} [context]
 * @returns {Promise<{effect: string, magnitude: number, mechanism: string, confidence: number}>}
 */
export async function interventionEffect(intervention, outcome, context = '') {
  const prompt = `You are a causal intervention analyst.

Intervention (do-operator): "${intervention}"
Outcome to measure: "${outcome}"
Context: ${context.slice(0, 1000)}

Using Pearl's do-calculus, estimate the causal effect of this intervention.
Account for: back-door paths, mediators, moderators.

Return JSON:
{
  "effect": "qualitative description of effect on outcome",
  "magnitude": -1.0 to 1.0,
  "mechanism": "causal path from intervention to outcome",
  "mediators": ["intermediate variables"],
  "moderators": ["variables that change the effect size"],
  "confidence": 0.0-1.0,
  "identificationStrategy": "how we identify this causal effect (RCT/IV/RDD/DiD/etc)"
}`;

  try {
    const raw = await callLLM({ task: 'reasoning', prompt, maxTokens: 500 });
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

    causalState.interventions.push({
      intervention, outcome, result,
      timestamp: new Date().toISOString(),
    });
    save();

    return result;
  } catch {
    return { effect: 'Unknown', magnitude: 0, mechanism: '', confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Causal chain tracing
// ---------------------------------------------------------------------------

/**
 * Trace the causal path between two events/entities in the stored causal graph.
 * BFS over causal DAG edges.
 *
 * @param {string} fromId  - Source node ID
 * @param {string} toId    - Target node ID
 * @param {number} [maxHops=5]
 * @returns {{path: any[], found: boolean, narrative: string}}
 */
export function causalChain(fromId, toId, maxHops = 5) {
  if (!causalState.nodes[fromId] || !causalState.nodes[toId]) {
    // Try fuzzy label match
    const nodes = Object.values(causalState.nodes);
    const from = nodes.find(n => n.label?.toLowerCase().includes(fromId.toLowerCase()));
    const to   = nodes.find(n => n.label?.toLowerCase().includes(toId.toLowerCase()));
    if (from) fromId = from.id;
    if (to)   toId   = to.id;
  }

  const visited = new Set([fromId]);
  const queue = [{ id: fromId, path: [] }];

  while (queue.length > 0) {
    const { id, path } = queue.shift();
    if (path.length >= maxHops) continue;

    const outEdges = causalState.edges.filter(e => e.from === id);
    for (const edge of outEdges) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);

      const newPath = [...path, {
        from: causalState.nodes[edge.from]?.label ?? edge.from,
        to:   causalState.nodes[edge.to]?.label   ?? edge.to,
        mechanism: edge.mechanism,
        strength: edge.strength,
      }];

      if (edge.to === toId) {
        const narrative = newPath
          .map(step => `${step.from} → [${step.mechanism}] → ${step.to} (strength: ${(step.strength * 100).toFixed(0)}%)`)
          .join('\n');
        return { path: newPath, found: true, narrative, hops: newPath.length };
      }

      queue.push({ id: edge.to, path: newPath });
    }
  }

  return { path: [], found: false, narrative: `No causal path found between ${fromId} and ${toId} within ${maxHops} hops.`, hops: 0 };
}

/**
 * Get causal graph stats.
 */
export function getCausalStats() {
  return {
    nodes: Object.keys(causalState.nodes).length,
    edges: causalState.edges.length,
    interventions: causalState.interventions.length,
    counterfactuals: causalState.counterfactuals.length,
    topCauses: causalState.edges
      .reduce((acc, e) => {
        acc[e.from] = (acc[e.from] || 0) + 1;
        return acc;
      }, {}),
  };
}

export const causalEngine = {
  extractCausalGraph,
  dualAgentDebate,
  abductActPredict,
  counterfactual,
  interventionEffect,
  causalChain,
  getCausalStats,
  getAllNodes: () => causalState.nodes,
  getAllEdges: () => causalState.edges,
};

export default causalEngine;
