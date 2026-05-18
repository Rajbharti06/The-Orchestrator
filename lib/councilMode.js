/**
 * councilMode.js - 3-Phase Council Consensus Engine
 *
 * Research basis: "Council Mode: Mitigating Hallucination and Bias in LLMs via
 * Multi-Agent Consensus" (arXiv:2604.02923), SWARM+ PBFT consensus
 * (arXiv:2603.19431), debate-consensus literature.
 *
 * 3-Phase Protocol:
 *   Phase 1 — TRIAGE:    Classify the problem, surface constraints, pick approach
 *   Phase 2 — DEBATE:    N independent experts generate solutions in parallel
 *                         (no cross-contamination — each agent is blind to others)
 *   Phase 3 — SYNTHESIS: Consensus synthesizer merges divergent paths into best answer
 *
 * Anti-sycophancy: agents run on DIFFERENT provider/model pairs when possible,
 * preventing echo-chamber agreement from using the same underlying weights.
 */

import { callLLM } from './llmRouter.js';

// Provider rotation: use different providers for each expert to avoid same-weight sycophancy
const EXPERT_PROVIDERS = [
  { provider: 'anthropic', task: 'reasoning' },
  { provider: 'featherless', task: 'reasoning' },
  { provider: 'deepseek', task: 'reasoning' },
  { provider: 'gemini', task: 'reasoning' },
];

async function llmSafe(prompt, opts = {}) {
  try {
    const res = await callLLM({ prompt, maxTokens: 600, task: 'reasoning', ...opts });
    return typeof res === 'string' ? res : String(res);
  } catch (err) {
    return `[Expert failed: ${err.message.slice(0, 80)}]`;
  }
}

// ---------------------------------------------------------------------------
// Phase 1: Triage
// ---------------------------------------------------------------------------

/**
 * Classify the problem and surface constraints before debate.
 * @param {string} question - The problem/decision to resolve
 * @returns {Promise<{category: string, constraints: string[], approach: string, riskLevel: 'low'|'medium'|'high'}>}
 */
async function triage(question) {
  const prompt = `You are the triage agent. Classify this problem and surface key constraints.

Problem: ${question}

Return JSON only:
{
  "category": "code|security|architecture|data|deployment|planning|other",
  "constraints": ["constraint 1", "constraint 2"],
  "approach": "One sentence on the best general approach",
  "riskLevel": "low|medium|high",
  "requiresConsensus": true|false
}`;

  try {
    const raw = await callLLM({ prompt, task: 'fast', maxTokens: 400 });
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      category:          parsed.category          ?? 'other',
      constraints:       parsed.constraints        ?? [],
      approach:          parsed.approach           ?? '',
      riskLevel:         parsed.riskLevel          ?? 'medium',
      requiresConsensus: parsed.requiresConsensus  ?? true,
    };
  } catch {
    return { category: 'other', constraints: [], approach: '', riskLevel: 'medium', requiresConsensus: true };
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Parallel Expert Debate
// ---------------------------------------------------------------------------

/**
 * Run N independent expert agents in parallel.
 * Each expert is BLIND to other experts' responses (no contamination).
 *
 * @param {string} question
 * @param {Object} triageResult
 * @param {number} [expertCount=3]
 * @returns {Promise<Array<{expertIndex: number, reasoning: string, answer: string, confidence: number}>>}
 */
async function debate(question, triageResult, expertCount = 3) {
  const expertPrompt = (idx) => `You are Expert ${idx + 1} of ${expertCount} in an independent review panel.
You have NO knowledge of what other experts think. Form your OWN conclusion.

Problem: ${question}
Context: Category=${triageResult.category}, Risk=${triageResult.riskLevel}
Constraints: ${triageResult.constraints.join('; ') || 'none'}

Provide your INDEPENDENT analysis. Return JSON only:
{
  "reasoning": "Your step-by-step reasoning (3-5 sentences)",
  "answer": "Your specific recommendation or solution",
  "confidence": 0.0-1.0,
  "keyRisks": ["risk1", "risk2"],
  "dissent": "Any concern you'd raise even if others disagree"
}`;

  const tasks = Array.from({ length: expertCount }, (_, i) => {
    const provCfg = EXPERT_PROVIDERS[i % EXPERT_PROVIDERS.length];
    return llmSafe(expertPrompt(i), {
      task: provCfg.task,
      provider: provCfg.provider,
      maxTokens: 600,
    }).then(raw => {
      try {
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
        return {
          expertIndex: i,
          reasoning:   parsed.reasoning   ?? raw.slice(0, 200),
          answer:      parsed.answer      ?? '',
          confidence:  parsed.confidence  ?? 0.7,
          keyRisks:    parsed.keyRisks    ?? [],
          dissent:     parsed.dissent     ?? '',
        };
      } catch {
        return { expertIndex: i, reasoning: raw.slice(0, 200), answer: raw.slice(0, 100), confidence: 0.5, keyRisks: [], dissent: '' };
      }
    });
  });

  return Promise.all(tasks);
}

// ---------------------------------------------------------------------------
// Phase 3: Synthesis
// ---------------------------------------------------------------------------

/**
 * Synthesize expert opinions into a single best answer.
 * Preserves dissenting views where significant (prevents false consensus).
 *
 * @param {string}  question
 * @param {Array}   expertOpinions
 * @param {Object}  triageResult
 * @returns {Promise<{consensus: string, confidence: number, divergencePoints: string[], recommendation: string}>}
 */
async function synthesize(question, expertOpinions, triageResult) {
  const opinionsText = expertOpinions
    .map((e, i) => `Expert ${i + 1} (confidence: ${(e.confidence * 100).toFixed(0)}%):\n  Reasoning: ${e.reasoning}\n  Answer: ${e.answer}\n  Dissent: ${e.dissent || 'none'}`)
    .join('\n\n');

  const prompt = `You are the synthesis agent. Merge ${expertOpinions.length} independent expert opinions into the best answer.

Problem: ${question}

Expert Opinions:
${opinionsText}

Instructions:
- Weight by confidence score
- Preserve legitimate dissenting points (don't suppress minority views)
- If experts fundamentally disagree, explain WHY and recommend the safer path
- Do NOT invent consensus where none exists

Return JSON only:
{
  "consensus": "The synthesized best answer (2-4 sentences)",
  "confidence": 0.0-1.0,
  "divergencePoints": ["Point experts disagreed on 1", "..."],
  "recommendation": "Single clear action to take",
  "requiresHumanReview": true|false
}`;

  try {
    const raw = await callLLM({ prompt, task: 'reasoning', maxTokens: 700 });
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      consensus:           parsed.consensus           ?? '',
      confidence:          parsed.confidence          ?? 0.7,
      divergencePoints:    parsed.divergencePoints    ?? [],
      recommendation:      parsed.recommendation      ?? '',
      requiresHumanReview: parsed.requiresHumanReview ?? false,
    };
  } catch {
    const avgConf = expertOpinions.reduce((s, e) => s + e.confidence, 0) / (expertOpinions.length || 1);
    return {
      consensus: expertOpinions[0]?.answer ?? '',
      confidence: avgConf,
      divergencePoints: [],
      recommendation: expertOpinions[0]?.answer ?? '',
      requiresHumanReview: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Anti-sycophancy diversity score
// ---------------------------------------------------------------------------

/**
 * Measure genuine diversity across expert opinions.
 * 0.0 = all identical (sycophantic), 1.0 = genuinely independent views.
 */
function diversityScore(opinions) {
  if (opinions.length < 2) return 1;

  const confidences = opinions.map(o => o.confidence);
  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const variance = confidences.reduce((s, c) => s + (c - mean) ** 2, 0) / confidences.length;
  const confSpread = Math.min(1, Math.sqrt(variance) / 0.25);

  // Check answer diversity via crude overlap
  const answers = opinions.map(o => o.answer.toLowerCase().slice(0, 50));
  const uniqueAnswers = new Set(answers).size;
  const answerDiversity = (uniqueAnswers - 1) / Math.max(answers.length - 1, 1);

  return Math.min(1, (confSpread + answerDiversity) / 2);
}

// ---------------------------------------------------------------------------
// Main council entry point
// ---------------------------------------------------------------------------

/**
 * Run full 3-phase council on a question/decision.
 *
 * @param {Object}  opts
 * @param {string}  opts.question       - Problem or decision to resolve
 * @param {number}  [opts.experts=3]    - Expert count (3-5 recommended)
 * @param {boolean} [opts.fast=false]   - Skip triage phase for simple questions
 * @returns {Promise<{
 *   triage:      Object,
 *   experts:     Array,
 *   synthesis:   Object,
 *   diversity:   number,
 *   passed:      boolean,
 *   phases:      string[]
 * }>}
 */
export async function runCouncil({ question, experts = 3, fast = false }) {
  if (process.env.MOCK === 'true') {
    return {
      triage:    { category: 'code', riskLevel: 'medium', requiresConsensus: true },
      experts:   [{ expertIndex: 0, answer: 'Mock answer', confidence: 0.9, reasoning: 'Mock.' }],
      synthesis: { consensus: 'Mock consensus', confidence: 0.9, recommendation: 'Proceed', requiresHumanReview: false },
      diversity: 0.8,
      passed:    true,
      phases:    ['triage', 'debate', 'synthesis'],
    };
  }

  const phases = [];

  // Phase 1: Triage
  let triageResult = { category: 'other', constraints: [], approach: '', riskLevel: 'low', requiresConsensus: false };
  if (!fast) {
    triageResult = await triage(question);
    phases.push('triage');

    // Simple questions skip full debate
    if (!triageResult.requiresConsensus && triageResult.riskLevel === 'low') {
      const quickAnswer = await llmSafe(question, { task: 'fast' });
      return {
        triage: triageResult,
        experts: [{ expertIndex: 0, answer: quickAnswer, confidence: 0.8, reasoning: 'Simple query — fast path.' }],
        synthesis: { consensus: quickAnswer, confidence: 0.8, recommendation: quickAnswer, requiresHumanReview: false, divergencePoints: [] },
        diversity: 1,
        passed: true,
        phases: ['triage', 'fast'],
      };
    }
  }

  // Phase 2: Parallel debate
  const expertOpinions = await debate(question, triageResult, experts);
  phases.push('debate');

  // Phase 3: Synthesis
  const synthesis = await synthesize(question, expertOpinions, triageResult);
  phases.push('synthesis');

  const diversity = diversityScore(expertOpinions);

  // Low diversity = possible sycophancy — flag for re-run warning
  if (diversity < 0.25) {
    synthesis.requiresHumanReview = true;
    synthesis.sycophancyWarning = true;
  }

  return {
    triage:    triageResult,
    experts:   expertOpinions,
    synthesis,
    diversity,
    passed:    synthesis.confidence >= 0.6 && !synthesis.requiresHumanReview,
    phases,
  };
}

/**
 * Quick council for binary approve/block decisions.
 *
 * @param {string} question
 * @returns {Promise<{approved: boolean, confidence: number, reason: string}>}
 */
export async function councilVote(question) {
  const result = await runCouncil({ question, experts: 3, fast: false });
  const rec = result.synthesis.recommendation.toLowerCase();
  const approved = rec.includes('approve') || rec.includes('proceed') || rec.includes('yes') || rec.includes('accept');
  return {
    approved,
    confidence: result.synthesis.confidence,
    reason:     result.synthesis.consensus,
    diversity:  result.diversity,
  };
}

export default { runCouncil, councilVote };
