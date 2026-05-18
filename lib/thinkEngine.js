/**
 * thinkEngine.js — The Cognitive Core
 *
 * Implements the 5 intelligence primitives that make Orchestrator X think
 * like a Palantir Gotham analyst + intelligence agency AI system:
 *
 *   THINK   — Adaptive Graph of Thoughts (AGoT, arXiv:2502.05078): dynamic DAG
 *              reasoning that decomposes complex problems recursively, expanding
 *              only nodes that require deeper analysis (+46.2% GPQA)
 *   RELATE  — Entity linking + pattern recognition across knowledge graph:
 *              finds indirect connections via typed ontology traversal
 *              (Palantir "search around" + i2 ELP methodology)
 *   SUGGEST — Hypothesis generation with confidence scoring + causal grounding:
 *              DARPA KAIROS schema-matching + abductive inference
 *   EXECUTE — A2P (Abduct-Act-Predict) causal action planning: each action
 *              is verified by simulating its counterfactual trajectory
 *   PRESENT — Intelligence-grade output: BLUF + evidence chains + confidence
 *              levels (IC Analytic Standards format)
 *
 * All 5 primitives compose into a unified reasoning pipeline that can be
 * called as a whole or individually.
 */

import { callLLM } from './llmRouter.js';
import { knowledgeGraph } from './knowledgeGraph.js';
import { ontologyEngine } from './ontologyEngine.js';

// ---------------------------------------------------------------------------
// AGoT Node — unit of the reasoning DAG
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ThoughtNode
 * @property {string}   id
 * @property {string}   question      - What this node is trying to answer
 * @property {string}   reasoning     - The reasoning produced
 * @property {string}   conclusion    - The conclusion reached
 * @property {number}   confidence    - 0-1
 * @property {boolean}  needsExpansion - Should this be broken into subnodes?
 * @property {string[]} childIds      - IDs of expanded subnodes
 * @property {'leaf'|'branch'|'root'} role
 * @property {string}   depth
 */

async function llm(prompt, opts = {}) {
  try {
    const res = await callLLM({ task: 'reasoning', maxTokens: 800, prompt, ...opts });
    return typeof res === 'string' ? res : String(res);
  } catch (e) {
    return `[Think error: ${e.message.slice(0, 60)}]`;
  }
}

// ---------------------------------------------------------------------------
// 1. THINK — Adaptive Graph of Thoughts (AGoT)
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a reasoning node needs to be expanded into subproblems.
 * AGoT key insight: only expand where uncertainty is high or complexity warrants it.
 */
async function shouldExpand(node, depth, maxDepth) {
  if (depth >= maxDepth) return false;
  if (node.confidence >= 0.88) return false;
  if (!node.needsExpansion) return false;
  return true;
}

/**
 * Decompose a complex question into structured subproblems (AGoT expansion).
 */
async function decomposeIntoSubproblems(question, context = '') {
  const prompt = `You are decomposing a complex problem into atomic, solvable subproblems.
Use an Adaptive Graph of Thoughts: only create subproblems where the question genuinely
requires multiple distinct reasoning paths.

Question: ${question}
Context: ${context.slice(0, 400)}

Decompose into 2-4 subproblems. Return JSON only:
{
  "subproblems": [
    {
      "question": "Specific sub-question",
      "rationale": "Why this subproblem is necessary",
      "dependsOn": [],
      "complexity": "simple|moderate|complex"
    }
  ],
  "canAnswerDirectly": true|false,
  "directAnswer": "If canAnswerDirectly is true, answer here"
}`;

  try {
    const raw = await llm(prompt, { task: 'reasoning' });
    return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  } catch {
    return { canAnswerDirectly: true, directAnswer: '', subproblems: [] };
  }
}

/**
 * Reason through a single thought node.
 */
async function reasonNode(question, context, parentReasoning = '') {
  const prompt = `Reason through this question step-by-step.

Question: ${question}
Context: ${context.slice(0, 500)}
${parentReasoning ? `Parent reasoning: ${parentReasoning.slice(0, 300)}` : ''}

Provide rigorous reasoning. Return JSON only:
{
  "reasoning": "Step-by-step reasoning (3-5 sentences)",
  "conclusion": "Direct answer to the question",
  "confidence": 0.0-1.0,
  "uncertainties": ["what you're unsure about"],
  "needsExpansion": true|false
}`;

  try {
    const raw = await llm(prompt, { task: 'reasoning' });
    return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  } catch {
    return { reasoning: '', conclusion: '', confidence: 0.5, uncertainties: [], needsExpansion: false };
  }
}

/**
 * THINK — Recursive AGoT reasoning over a problem.
 *
 * @param {string} question   - The problem to think through
 * @param {string} context    - Background context
 * @param {number} maxDepth   - Maximum recursion depth (default 3)
 * @returns {Promise<{nodes: ThoughtNode[], synthesis: string, confidence: number, reasoningPath: string[]}>}
 */
export async function think(question, context = '', maxDepth = 3) {
  if (process.env.MOCK === 'true') {
    return {
      nodes: [{ id: 'root', question, reasoning: 'Mock reasoning.', conclusion: 'Mock conclusion.', confidence: 0.9, role: 'root' }],
      synthesis: 'Mock synthesis.',
      confidence: 0.9,
      reasoningPath: [question],
    };
  }

  const nodes = new Map();
  const reasoningPath = [];

  async function processNode(question, depth, parentId = null, parentReasoning = '') {
    const id = `node-${depth}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Reason through this node
    const result = await reasonNode(question, context, parentReasoning);

    const node = {
      id,
      question,
      reasoning: result.reasoning || '',
      conclusion: result.conclusion || '',
      confidence: result.confidence || 0.6,
      needsExpansion: result.needsExpansion && depth < maxDepth,
      childIds: [],
      role: depth === 0 ? 'root' : depth >= maxDepth ? 'leaf' : 'branch',
      depth,
      parentId,
    };

    nodes.set(id, node);
    reasoningPath.push(`[D${depth}] ${question}: ${result.conclusion?.slice(0, 80)}`);

    // AGoT expansion: only expand if necessary
    if (await shouldExpand(node, depth, maxDepth)) {
      const decomposition = await decomposeIntoSubproblems(question, context);

      if (!decomposition.canAnswerDirectly && decomposition.subproblems?.length > 0) {
        for (const sub of decomposition.subproblems.slice(0, 3)) {
          const childId = await processNode(sub.question, depth + 1, id, result.reasoning);
          node.childIds.push(childId);
        }
        // Update confidence based on children
        const childConfs = node.childIds.map(cid => nodes.get(cid)?.confidence || 0.5);
        node.confidence = childConfs.reduce((a, b) => a + b, 0) / (childConfs.length || 1);
      }
    }

    return id;
  }

  const rootId = await processNode(question, 0);

  // Synthesize all nodes into a final answer
  const nodeList = [...nodes.values()];
  const leafConclusions = nodeList
    .filter(n => n.childIds.length === 0)
    .map(n => `[${(n.confidence * 100).toFixed(0)}%] ${n.conclusion}`)
    .join('\n');

  const synthesisPrompt = `Synthesize these reasoning conclusions into a single coherent answer.

Original question: ${question}
Reasoning conclusions:
${leafConclusions}

Provide the synthesized answer in 2-4 sentences:`;

  const synthesis = await llm(synthesisPrompt, { task: 'reasoning', maxTokens: 400 });
  const avgConfidence = nodeList.reduce((s, n) => s + n.confidence, 0) / (nodeList.length || 1);

  return {
    nodes: nodeList,
    synthesis: synthesis.replace(/```[\s\S]*?```/g, '').trim(),
    confidence: avgConfidence,
    reasoningPath,
    rootId,
  };
}

// ---------------------------------------------------------------------------
// 2. RELATE — Entity linking + indirect connection discovery
// ---------------------------------------------------------------------------

/**
 * RELATE — Find how concepts, entities, and facts connect.
 * Implements Palantir's "search around" + i2 ELP link analysis methodology.
 *
 * @param {string}   focusEntity  - The entity to search around
 * @param {string}   context      - Raw context to extract entities from
 * @param {number}   [hops=2]     - How many relationship hops to traverse
 * @returns {Promise<{entities: any[], links: any[], indirectConnections: any[], patterns: string[]}>}
 */
export async function relate(focusEntity, context = '', hops = 2) {
  if (process.env.MOCK === 'true') {
    return { entities: [], links: [], indirectConnections: [], patterns: ['Mock pattern'] };
  }

  // Extract entities from context
  const extractPrompt = `You are an intelligence analyst performing entity extraction and link analysis.
Using i2 Analyst's Notebook ELP (Entity-Link-Property) methodology.

Context: ${context.slice(0, 2000)}
Focus Entity: ${focusEntity}

Extract:
1. All entities (people, organizations, locations, events, artifacts, concepts, threats)
2. Direct relationships to the focus entity
3. Indirect connections (A→B→C where A is focus entity)
4. Temporal metadata for each relationship

Return JSON only:
{
  "entities": [
    {"id": "unique-id", "name": "...", "type": "person|org|location|event|artifact|concept|threat", "properties": {"key": "value"}, "confidence": 0.0-1.0}
  ],
  "links": [
    {"from": "entity-id", "to": "entity-id", "relation": "...", "timestamp": "ISO8601 or null", "confidence": 0.0-1.0, "evidence": "..."}
  ],
  "indirectConnections": [
    {"path": ["entity1", "via-entity", "entity2"], "connectionType": "...", "significance": "low|medium|high"}
  ],
  "patterns": ["Pattern 1 observed", "Pattern 2"]
}`;

  try {
    const raw = await llm(extractPrompt, { task: 'reasoning', maxTokens: 1200 });
    const extracted = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

    // Store in knowledge graph for future retrieval
    if (extracted.entities) {
      for (const entity of extracted.entities) {
        await knowledgeGraph.addEntity(entity);
      }
    }
    if (extracted.links) {
      for (const link of extracted.links) {
        await knowledgeGraph.addTriple(link.from, link.relation, link.to, {
          timestamp: link.timestamp,
          confidence: link.confidence,
          evidence: link.evidence,
        });
      }
    }

    return {
      entities:             extracted.entities            ?? [],
      links:                extracted.links               ?? [],
      indirectConnections:  extracted.indirectConnections ?? [],
      patterns:             extracted.patterns            ?? [],
      focusEntity,
      hops,
    };
  } catch {
    return { entities: [], links: [], indirectConnections: [], patterns: [], focusEntity, hops };
  }
}

// ---------------------------------------------------------------------------
// 3. SUGGEST — Hypothesis generation with DARPA KAIROS schema-matching
// ---------------------------------------------------------------------------

/**
 * SUGGEST — Generate ranked hypotheses to explain observations.
 * Uses DARPA KAIROS schema-matching (complex event pattern recognition)
 * + abductive reasoning (inference to best explanation).
 *
 * @param {string}   observation  - What was observed / the problem
 * @param {Object}   [relateResult] - Output from relate() for context
 * @param {number}   [topK=5]     - Number of hypotheses to generate
 * @returns {Promise<{hypotheses: any[], topHypothesis: any, schema: string}>}
 */
export async function suggest(observation, relateResult = null, topK = 5) {
  if (process.env.MOCK === 'true') {
    return {
      hypotheses: [{ hypothesis: 'Mock hypothesis', confidence: 0.85, evidence: [], counterEvidence: [] }],
      topHypothesis: { hypothesis: 'Mock hypothesis', confidence: 0.85 },
      schema: 'general',
    };
  }

  const entityContext = relateResult?.entities
    ? `Known entities: ${relateResult.entities.map(e => `${e.name}(${e.type})`).join(', ')}\n` +
      `Observed patterns: ${relateResult.patterns?.join('; ')}`
    : '';

  const prompt = `You are a DARPA KAIROS-inspired intelligence analyst generating hypotheses.

Observation: ${observation}
${entityContext}

Step 1: SCHEMA MATCHING — What type of complex event is this?
  (Options: supply-chain-attack, data-breach, insider-threat, nation-state-intrusion,
   ransomware-campaign, phishing-campaign, zero-day-exploitation, social-engineering,
   credential-compromise, lateral-movement, data-exfiltration, general-problem)

Step 2: ABDUCTIVE REASONING — Generate ${topK} hypotheses explaining the observation.
  For each: state what it predicts, what evidence supports it, what would disprove it.

Step 3: RANK by plausibility.

Return JSON only:
{
  "schema": "event-type-name",
  "hypotheses": [
    {
      "hypothesis": "Specific explanation",
      "confidence": 0.0-1.0,
      "predictedIndicators": ["what we'd see if this is true"],
      "evidence": ["supporting evidence from context"],
      "counterEvidence": ["what contradicts this"],
      "actionToVerify": "One test that would confirm/refute this hypothesis"
    }
  ],
  "recommendedHypothesis": 0
}`;

  try {
    const raw = await llm(prompt, { task: 'reasoning', maxTokens: 1200 });
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    const hypotheses = result.hypotheses ?? [];
    const topIdx = result.recommendedHypothesis ?? 0;

    return {
      hypotheses,
      topHypothesis: hypotheses[topIdx] ?? hypotheses[0] ?? null,
      schema: result.schema ?? 'general',
    };
  } catch {
    return { hypotheses: [], topHypothesis: null, schema: 'general' };
  }
}

// ---------------------------------------------------------------------------
// 4. EXECUTE — A2P causal action planning
// ---------------------------------------------------------------------------

/**
 * EXECUTE — Plan and verify actions using A2P (Abduct-Act-Predict).
 * Research basis: arXiv:2509.10401 — Abduct, Act, Predict scaffolding.
 *
 * For each proposed action:
 *   ABDUCT  — Infer hidden factors that explain why this action is needed
 *   ACT     — Define the minimal intervention
 *   PREDICT — Simulate what happens after (counterfactual trajectory)
 *
 * @param {string}   goal         - What we're trying to accomplish
 * @param {Object}   [context]    - Prior think/relate/suggest outputs
 * @returns {Promise<{actions: any[], executionPlan: string, expectedOutcome: string, risks: string[]}>}
 */
export async function execute(goal, context = {}) {
  if (process.env.MOCK === 'true') {
    return {
      actions: [{ action: 'Mock action', abduction: 'Mock.', prediction: 'Mock.', confidence: 0.9, order: 1 }],
      executionPlan: 'Mock plan.',
      expectedOutcome: 'Mock outcome.',
      risks: [],
    };
  }

  const priorContext = [
    context.synthesis ? `Prior reasoning: ${context.synthesis}` : '',
    context.topHypothesis ? `Best hypothesis: ${context.topHypothesis.hypothesis}` : '',
    context.patterns ? `Patterns: ${context.patterns.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are an intelligence mission planner using A2P (Abduct-Act-Predict) causal scaffolding.

Goal: ${goal}
${priorContext}

For each action in your execution plan, apply the A2P framework:
1. ABDUCT: What hidden factors make this action necessary?
2. ACT: The minimal, precise intervention (what exactly to do)
3. PREDICT: Simulate the counterfactual — what happens after this action?
   If this action FAILS, what is the impact on the overall goal?

Generate 3-6 ordered actions. Return JSON only:
{
  "actions": [
    {
      "order": 1,
      "action": "Precise action description",
      "abduction": "Why this action is necessary (hidden factors)",
      "intervention": "Exact steps to execute",
      "prediction": "Expected outcome after this action",
      "failurePrediction": "What happens if this action fails",
      "confidence": 0.0-1.0,
      "dependencies": [1, 2],
      "agentRole": "planner|architect|backend|qa|security|deploy"
    }
  ],
  "executionPlan": "2-3 sentence high-level plan",
  "expectedOutcome": "What success looks like",
  "risks": ["Risk 1", "Risk 2"],
  "contingencies": {"if X fails": "do Y instead"}
}`;

  try {
    const raw = await llm(prompt, { task: 'reasoning', maxTokens: 1500 });
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      actions:         result.actions         ?? [],
      executionPlan:   result.executionPlan    ?? '',
      expectedOutcome: result.expectedOutcome  ?? '',
      risks:           result.risks            ?? [],
      contingencies:   result.contingencies    ?? {},
    };
  } catch {
    return { actions: [], executionPlan: '', expectedOutcome: '', risks: [], contingencies: {} };
  }
}

// ---------------------------------------------------------------------------
// 5. PRESENT — Intelligence-grade output formatting
// ---------------------------------------------------------------------------

/**
 * PRESENT — Format analysis as an intelligence report.
 * IC Analytic Standards: BLUF + Key Judgments + Evidence Chains + Confidence Levels.
 *
 * @param {Object} opts
 * @param {string}   opts.subject      - What the report is about
 * @param {Object}   [opts.think]      - Output from think()
 * @param {Object}   [opts.relate]     - Output from relate()
 * @param {Object}   [opts.suggest]    - Output from suggest()
 * @param {Object}   [opts.execute]    - Output from execute()
 * @param {'brief'|'full'|'executive'} [opts.format='full']
 * @returns {Promise<{bluf: string, keyJudgments: string[], evidenceChains: any[], report: string, confidence: number}>}
 */
export async function present({ subject, think: thinkResult, relate: relateResult, suggest: suggestResult, execute: executeResult, format = 'full' }) {
  if (process.env.MOCK === 'true') {
    return {
      bluf: 'Mock BLUF: System analyzed, results ready.',
      keyJudgments: ['Mock judgment 1', 'Mock judgment 2'],
      evidenceChains: [],
      report: `# Intelligence Report\n\n**BLUF**: Mock BLUF\n\n**Subject**: ${subject}`,
      confidence: 0.9,
    };
  }

  const inputs = [
    thinkResult?.synthesis ? `REASONING: ${thinkResult.synthesis}` : '',
    relateResult?.patterns ? `PATTERNS: ${relateResult.patterns.join('; ')}` : '',
    suggestResult?.topHypothesis ? `TOP HYPOTHESIS: ${suggestResult.topHypothesis.hypothesis} (${(suggestResult.topHypothesis.confidence * 100).toFixed(0)}% confidence)` : '',
    executeResult?.executionPlan ? `EXECUTION PLAN: ${executeResult.executionPlan}` : '',
    executeResult?.risks ? `RISKS: ${executeResult.risks.join('; ')}` : '',
  ].filter(Boolean).join('\n\n');

  const prompt = `You are an intelligence analyst writing a ${format} report.
Use IC Analytic Standards: BLUF (Bottom Line Up Front) + Key Judgments + Evidence.

Subject: ${subject}

Analysis inputs:
${inputs}

Write a ${format === 'brief' ? 'concise 3-paragraph' : format === 'executive' ? '1-page executive' : 'full intelligence'} report.

Return JSON only:
{
  "bluf": "1-2 sentence bottom line (most critical finding, stated directly)",
  "keyJudgments": [
    "Key judgment 1 with confidence indicator (High/Moderate/Low Confidence)",
    "Key judgment 2..."
  ],
  "evidenceChains": [
    {
      "claim": "Specific claim",
      "evidence": ["supporting fact 1", "supporting fact 2"],
      "strength": "strong|moderate|weak",
      "confidence": 0.0-1.0
    }
  ],
  "reportMarkdown": "Full formatted report in markdown with headers",
  "overallConfidence": 0.0-1.0,
  "dissent": "Any dissenting view or uncertainty that should be flagged"
}`;

  try {
    const raw = await llm(prompt, { task: 'reasoning', maxTokens: 2000 });
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      bluf:           result.bluf            ?? '',
      keyJudgments:   result.keyJudgments    ?? [],
      evidenceChains: result.evidenceChains  ?? [],
      report:         result.reportMarkdown  ?? raw,
      confidence:     result.overallConfidence ?? 0.7,
      dissent:        result.dissent         ?? null,
    };
  } catch {
    return {
      bluf: `Analysis of: ${subject}`,
      keyJudgments: [],
      evidenceChains: [],
      report: `# ${subject}\n\n${inputs}`,
      confidence: 0.6,
      dissent: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Full pipeline: THINK → RELATE → SUGGEST → EXECUTE → PRESENT
// ---------------------------------------------------------------------------

/**
 * Run the complete intelligence pipeline on any problem.
 * This is the "god-mode" reasoning function — the equivalent of a full
 * Palantir Gotham analyst workflow in a single call.
 *
 * @param {Object} opts
 * @param {string}   opts.problem     - The problem to analyze
 * @param {string}   opts.context     - Background information
 * @param {string}   opts.focusEntity - Key entity to link-analyze
 * @param {'brief'|'full'|'executive'} [opts.reportFormat='full']
 * @param {number}   [opts.thinkDepth=3] - AGoT recursion depth
 * @returns {Promise<Object>} Full intelligence assessment
 */
export async function runIntelligencePipeline({ problem, context = '', focusEntity = '', reportFormat = 'full', thinkDepth = 3 }) {
  const start = Date.now();
  const pipeline = {};

  // Phase 1: THINK — AGoT reasoning
  pipeline.think = await think(problem, context, thinkDepth);

  // Phase 2: RELATE — Entity linking (parallel with think synthesis)
  pipeline.relate = await relate(focusEntity || problem, context + '\n' + pipeline.think.synthesis);

  // Phase 3: SUGGEST — Hypothesis generation
  pipeline.suggest = await suggest(problem, pipeline.relate);

  // Phase 4: EXECUTE — Action planning
  pipeline.execute = await execute(problem, {
    synthesis:      pipeline.think.synthesis,
    topHypothesis:  pipeline.suggest.topHypothesis,
    patterns:       pipeline.relate.patterns,
  });

  // Phase 5: PRESENT — Intelligence report
  pipeline.present = await present({
    subject:   problem,
    think:     pipeline.think,
    relate:    pipeline.relate,
    suggest:   pipeline.suggest,
    execute:   pipeline.execute,
    format:    reportFormat,
  });

  pipeline.metadata = {
    problem,
    durationMs:  Date.now() - start,
    nodesReasoned: pipeline.think.nodes?.length ?? 0,
    entitiesFound: pipeline.relate.entities?.length ?? 0,
    hypotheses:    pipeline.suggest.hypotheses?.length ?? 0,
    actions:       pipeline.execute.actions?.length ?? 0,
    confidence:    pipeline.present.confidence,
    timestamp:     new Date().toISOString(),
  };

  return pipeline;
}

export default { think, relate, suggest, execute, present, runIntelligencePipeline };
