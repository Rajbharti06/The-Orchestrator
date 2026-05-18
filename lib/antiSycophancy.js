/**
 * antiSycophancy.js - Multi-layer anti-sycophancy system
 *
 * Research basis:
 * - Council Mode (arXiv:2604.02923): 3-phase consensus reduces hallucination + bias
 * - SWARM+ PBFT (arXiv:2603.19431): distributed consensus across heterogeneous agents
 * - "Adversarial Debate and Voting Mechanisms" (MDPI 2076-3417, 2025)
 * - AgentPRM step-wise verification (arXiv:2511.08325)
 *
 * Key principle: reviewers run on DIFFERENT provider/model pairs to prevent
 * same-weight sycophancy. A single provider reviewing its own output is useless.
 *
 * Gates:
 *   blindReview         — N isolated reviewers, different providers, no cross-contamination
 *   consensusGate       — 2/3 approval required to proceed
 *   diversityScore      — measures genuine opinion independence (< 0.3 = re-run warning)
 *   mutationDetect      — LLM-based: would broken code still pass tests?
 *   backwardCompatCheck — API breaking change detection
 *   documentationCoverage
 *   adversarialDebate   — NEW: explicit red-team challenge before consensus
 */

import { callLLM } from './llmRouter.js';

// Each reviewer uses a different provider/task to prevent echo-chamber
const REVIEWER_CONFIGS = [
  { role: 'security',    provider: 'anthropic',   task: 'security' },
  { role: 'quality',     provider: 'featherless',  task: 'qa' },
  { role: 'correctness', provider: 'deepseek',     task: 'reasoning' },
  { role: 'performance', provider: 'groq',         task: 'qa' },
];

async function llm(prompt, maxTokens = 400, opts = {}) {
  try {
    const res = await callLLM({ task: 'qa', prompt, maxTokens, ...opts });
    return typeof res === 'string' ? res : res?.content ?? JSON.stringify(res);
  } catch (err) {
    return `[LLM error: ${err.message.slice(0, 60)}]`;
  }
}

// ---------------------------------------------------------------------------
// Blind Review — isolated reviewers on DIFFERENT providers
// ---------------------------------------------------------------------------

/**
 * Each reviewer evaluates independently with no cross-contamination.
 * Different provider per reviewer prevents same-weight sycophancy.
 *
 * @param {string}   code       - Code or artifact to review
 * @param {string}   context    - Task description / acceptance criteria
 * @param {string[]} [reviewers] - Reviewer roles (maps to REVIEWER_CONFIGS)
 * @returns {Promise<Array<{reviewer, provider, verdict, score, comments}>>}
 */
export async function blindReview(code, context, reviewers = ['security', 'quality', 'correctness']) {
  const selectedConfigs = reviewers.map(role =>
    REVIEWER_CONFIGS.find(c => c.role === role) ?? { role, provider: 'anthropic', task: 'qa' }
  );

  const tasks = selectedConfigs.map(async (cfg) => {
    const prompt = `You are a ${cfg.role} reviewer. Evaluate this code INDEPENDENTLY and STRICTLY.
Do NOT be lenient. Your job is to find real problems.

Context: ${context}

Code:
${code.slice(0, 2500)}

Return JSON only:
{
  "verdict": "APPROVED"|"CHANGES_REQUESTED"|"BLOCKED",
  "score": 0-100,
  "comments": "Specific feedback (not generic)",
  "criticalIssues": ["issue1", "issue2"],
  "passedChecks": ["check1"]
}`;

    const raw = await llm(prompt, 500, { task: cfg.task, provider: cfg.provider });
    try {
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      return {
        reviewer:       cfg.role,
        provider:       cfg.provider,
        verdict:        parsed.verdict        ?? 'CHANGES_REQUESTED',
        score:          parsed.score          ?? 50,
        comments:       parsed.comments       ?? raw.slice(0, 200),
        criticalIssues: parsed.criticalIssues ?? [],
        passedChecks:   parsed.passedChecks   ?? [],
      };
    } catch {
      return { reviewer: cfg.role, provider: cfg.provider, verdict: 'CHANGES_REQUESTED', score: 50, comments: raw.slice(0, 200), criticalIssues: [], passedChecks: [] };
    }
  });

  return Promise.all(tasks);
}

// ---------------------------------------------------------------------------
// Adversarial Debate (NEW)
// One agent argues against the majority to surface hidden flaws
// ---------------------------------------------------------------------------

/**
 * Red-team challenge: devil's advocate argues against the current solution.
 * Surfaces hidden risks the regular reviewers may have missed.
 *
 * @param {string} code
 * @param {string} context
 * @param {Array}  reviews - Prior blind review results
 * @returns {Promise<{challenge: string, severity: 'low'|'medium'|'high', meritsRevision: boolean}>}
 */
export async function adversarialDebate(code, context, reviews) {
  const approvalSummary = reviews
    .map(r => `${r.reviewer}(${r.provider}): ${r.verdict} (${r.score}/100)`)
    .join(', ');

  const prompt = `You are a RED TEAM reviewer. Your job is to CHALLENGE the current solution.
Existing reviews: ${approvalSummary}

Code:
${code.slice(0, 2000)}
Context: ${context}

Assume the majority reviewers are WRONG or have missed something.
Find the single most dangerous flaw they overlooked.

Return JSON only:
{
  "challenge": "The specific dangerous flaw: (2-3 sentences)",
  "severity": "low"|"medium"|"high",
  "meritsRevision": true|false,
  "counterEvidence": "Why this flaw might actually matter more than reviewers noted"
}`;

  try {
    const raw = await llm(prompt, 400, { task: 'security', provider: 'anthropic' });
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      challenge:       parsed.challenge       ?? '',
      severity:        parsed.severity        ?? 'low',
      meritsRevision:  parsed.meritsRevision  ?? false,
      counterEvidence: parsed.counterEvidence ?? '',
    };
  } catch {
    return { challenge: '', severity: 'low', meritsRevision: false, counterEvidence: '' };
  }
}

// ---------------------------------------------------------------------------
// Consensus Gate
// ---------------------------------------------------------------------------

/**
 * Require threshold fraction of reviewers to APPROVE.
 * @param {Array<{verdict: string}>} reviews
 * @param {number} [threshold=0.66]
 */
export async function consensusGate(reviews, threshold = 0.66) {
  const approvals = reviews.filter(r => r.verdict === 'APPROVED').length;
  const ratio = approvals / (reviews.length || 1);
  return {
    decision:  ratio >= threshold ? 'APPROVED' : 'BLOCKED',
    approvals,
    total:     reviews.length,
    ratio,
  };
}

// ---------------------------------------------------------------------------
// Mutation Detection
// ---------------------------------------------------------------------------

export async function mutationDetect(code, tests) {
  const prompt = `Analyze whether these tests would catch a mutated (broken) version of the code.

Code:
${code.slice(0, 2000)}

Tests:
${tests.slice(0, 2000)}

Return JSON: { "catchesMutations": true/false, "weakSpots": ["..."], "confidence": 0-1 }`;

  const raw = await llm(prompt, 400, { task: 'security' });
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      catchesMutations: parsed.catchesMutations ?? false,
      weakSpots:        parsed.weakSpots        ?? [],
      confidence:       parsed.confidence       ?? 0.5,
    };
  } catch {
    return { catchesMutations: false, weakSpots: ['Parse failed'], confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Diversity / Anti-sycophancy Score
// ---------------------------------------------------------------------------

/**
 * 0.0 = all identical (sycophantic) → 1.0 = genuinely independent.
 * Score < 0.3 triggers re-run warning (agents are agreeing too easily).
 */
export async function antiSycophancyScore(reviews) {
  if (reviews.length < 2) return 1;

  // Provider diversity bonus: different providers = structurally more diverse
  const providers = reviews.map(r => r.provider).filter(Boolean);
  const uniqueProviders = new Set(providers).size;
  const providerDiversity = Math.min(1, (uniqueProviders - 1) / Math.max(providers.length - 1, 1));

  // Verdict diversity
  const verdicts = reviews.map(r => r.verdict);
  const uniqueVerdicts = new Set(verdicts).size;
  const verdictDiversity = (uniqueVerdicts - 1) / Math.max(verdicts.length - 1, 1);

  // Score spread
  const scores = reviews.map(r => r.score ?? 50);
  const mean     = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const scoreSpread = Math.min(1, Math.sqrt(variance) / 25);

  return Math.min(1, (verdictDiversity + scoreSpread + providerDiversity) / 3);
}

// ---------------------------------------------------------------------------
// Backward Compatibility Check
// ---------------------------------------------------------------------------

export async function backwardCompatCheck(oldAPI, newAPI) {
  const oldStr = typeof oldAPI === 'string' ? oldAPI : JSON.stringify(oldAPI, null, 2);
  const newStr = typeof newAPI === 'string' ? newAPI : JSON.stringify(newAPI, null, 2);
  const prompt = `Compare these two API definitions and identify breaking changes.

OLD API:
${oldStr.slice(0, 1500)}

NEW API:
${newStr.slice(0, 1500)}

Return JSON: { "breaking": true/false, "changes": ["..."], "severity": "none"|"patch"|"minor"|"major" }`;

  const raw = await llm(prompt, 400);
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return { breaking: parsed.breaking ?? false, changes: parsed.changes ?? [], severity: parsed.severity ?? 'none' };
  } catch {
    return { breaking: false, changes: [], severity: 'none', error: 'Parse failed' };
  }
}

// ---------------------------------------------------------------------------
// Documentation Coverage
// ---------------------------------------------------------------------------

export async function documentationCoverage(files) {
  const missing = [];
  let total = 0;
  let documented = 0;

  for (const content of files) {
    const exportMatches = [...content.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)];
    for (const [, fnName] of exportMatches) {
      total++;
      const fnIndex = content.indexOf(`function ${fnName}`);
      const before  = content.slice(Math.max(0, fnIndex - 200), fnIndex);
      if (/\/\*\*[\s\S]*?\*\/\s*$/.test(before)) {
        documented++;
      } else {
        missing.push(fnName);
      }
    }
  }

  return { coverage: total ? documented / total : 1, missing, total };
}

// ---------------------------------------------------------------------------
// Full review pipeline (blind + adversarial + consensus)
// ---------------------------------------------------------------------------

/**
 * Complete anti-sycophancy review: blind review + red-team + consensus gate.
 *
 * @param {string} code
 * @param {string} context
 * @returns {Promise<{decision: 'APPROVED'|'BLOCKED', reviews, debate, consensus, diversity, sycophancyWarning}>}
 */
export async function fullReview(code, context) {
  // Run blind review (3 reviewers on different providers)
  const reviews = await blindReview(code, context, ['security', 'quality', 'correctness']);

  // Red-team debate
  const debate = await adversarialDebate(code, context, reviews);

  // If red-team finds high-severity issue, inject CHANGES_REQUESTED
  if (debate.meritsRevision && debate.severity === 'high') {
    reviews.push({
      reviewer: 'red-team', provider: 'adversarial',
      verdict: 'CHANGES_REQUESTED', score: 30,
      comments: debate.challenge, criticalIssues: [debate.challenge], passedChecks: [],
    });
  }

  const consensus = await consensusGate(reviews);
  const diversity = await antiSycophancyScore(reviews);

  return {
    decision:          consensus.decision,
    reviews,
    debate,
    consensus,
    diversity,
    sycophancyWarning: diversity < 0.3,
  };
}

export default {
  blindReview, adversarialDebate, consensusGate,
  mutationDetect, antiSycophancyScore, backwardCompatCheck,
  documentationCoverage, fullReview,
};
