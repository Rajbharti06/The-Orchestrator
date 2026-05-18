/**
 * antiSycophancy.js - Blind Review System (Loki Mode)
 *
 * Prevents agents from agreeing sycophantically by enforcing isolated reviews,
 * consensus gates, mutation detection, and diversity scoring.
 */

import { callLLM } from './llmRouter.js';

async function llm(prompt, maxTokens = 300) {
  try {
    const res = await callLLM({ task: 'qa', prompt, maxTokens });
    return typeof res === 'string' ? res : res?.content ?? JSON.stringify(res);
  } catch (err) {
    return `[LLM error: ${err.message}]`;
  }
}

// ---------------------------------------------------------------------------
// Blind review
// ---------------------------------------------------------------------------

/**
 * Each reviewer evaluates the code independently (no cross-contamination).
 * @param {string} code
 * @param {string} context  - task description / acceptance criteria
 * @param {string[]} reviewers  - reviewer names/roles
 * @returns {Promise<Array<{reviewer: string, verdict: 'APPROVED'|'CHANGES_REQUESTED'|'BLOCKED', comments: string, score: number}>>}
 */
export async function blindReview(code, context, reviewers = ['security', 'quality', 'correctness']) {
  const tasks = reviewers.map(async (reviewer) => {
    const prompt = `You are a ${reviewer} reviewer. Evaluate this code strictly and independently.\n\nContext: ${context}\n\nCode:\n${code.slice(0, 3000)}\n\nReturn JSON: { "verdict": "APPROVED"|"CHANGES_REQUESTED"|"BLOCKED", "score": 0-100, "comments": "..." }`;
    const raw = await llm(prompt, 400);
    try {
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      return { reviewer, verdict: parsed.verdict ?? 'CHANGES_REQUESTED', score: parsed.score ?? 50, comments: parsed.comments ?? raw };
    } catch {
      return { reviewer, verdict: 'CHANGES_REQUESTED', score: 50, comments: raw };
    }
  });
  return Promise.all(tasks);
}

// ---------------------------------------------------------------------------
// Consensus gate
// ---------------------------------------------------------------------------

/**
 * Require threshold fraction of reviewers to APPROVE before passing.
 * @param {Array<{verdict: string}>} reviews
 * @param {number} threshold  - fraction (default 0.66)
 * @returns {Promise<{decision: 'APPROVED'|'BLOCKED', approvals: number, total: number, ratio: number}>}
 */
export async function consensusGate(reviews, threshold = 0.66) {
  const approvals = reviews.filter(r => r.verdict === 'APPROVED').length;
  const ratio = approvals / (reviews.length || 1);
  return {
    decision: ratio >= threshold ? 'APPROVED' : 'BLOCKED',
    approvals,
    total: reviews.length,
    ratio,
  };
}

// ---------------------------------------------------------------------------
// Mutation detection
// ---------------------------------------------------------------------------

/**
 * LLM-based check: would a broken version of this code still pass the tests?
 * @param {string} code
 * @param {string} tests
 * @returns {Promise<{catchesMutations: boolean, weakSpots: string[], confidence: number}>}
 */
export async function mutationDetect(code, tests) {
  const prompt = `Analyze whether these tests would catch a mutated (broken) version of the code.\n\nCode:\n${code.slice(0, 2000)}\n\nTests:\n${tests.slice(0, 2000)}\n\nReturn JSON: { "catchesMutations": true/false, "weakSpots": ["..."], "confidence": 0-1 }`;
  const raw = await llm(prompt, 400);
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      catchesMutations: parsed.catchesMutations ?? false,
      weakSpots:        parsed.weakSpots        ?? [],
      confidence:       parsed.confidence       ?? 0.5,
    };
  } catch {
    return { catchesMutations: false, weakSpots: ['Unable to parse LLM response'], confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Anti-sycophancy score
// ---------------------------------------------------------------------------

/**
 * Measure review diversity. 0 = all identical (sycophantic), 1 = genuinely independent.
 * @param {Array<{verdict: string, score: number, comments: string}>} reviews
 * @returns {Promise<number>} diversity score 0–1
 */
export async function antiSycophancyScore(reviews) {
  if (reviews.length < 2) return 1;

  // Verdict diversity
  const verdicts = reviews.map(r => r.verdict);
  const uniqueVerdicts = new Set(verdicts).size;
  const verdictDiversity = (uniqueVerdicts - 1) / Math.max(verdicts.length - 1, 1);

  // Score spread
  const scores = reviews.map(r => r.score ?? 50);
  const mean   = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const scoreSpread = Math.min(1, Math.sqrt(variance) / 30); // normalize by 30 pts std-dev

  return Math.min(1, (verdictDiversity + scoreSpread) / 2);
}

// ---------------------------------------------------------------------------
// Backward compatibility check
// ---------------------------------------------------------------------------

/**
 * Compare two API shapes and flag breaking changes.
 * @param {string|object} oldAPI
 * @param {string|object} newAPI
 * @returns {Promise<{breaking: boolean, changes: string[], severity: 'none'|'patch'|'minor'|'major'}>}
 */
export async function backwardCompatCheck(oldAPI, newAPI) {
  const oldStr = typeof oldAPI === 'string' ? oldAPI : JSON.stringify(oldAPI, null, 2);
  const newStr = typeof newAPI === 'string' ? newAPI : JSON.stringify(newAPI, null, 2);
  const prompt = `Compare these two API definitions and identify breaking changes.\n\nOLD API:\n${oldStr.slice(0, 1500)}\n\nNEW API:\n${newStr.slice(0, 1500)}\n\nReturn JSON: { "breaking": true/false, "changes": ["..."], "severity": "none"|"patch"|"minor"|"major" }`;
  const raw = await llm(prompt, 400);
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return { breaking: parsed.breaking ?? false, changes: parsed.changes ?? [], severity: parsed.severity ?? 'none' };
  } catch {
    return { breaking: false, changes: [], severity: 'none', error: 'Parse failed' };
  }
}

// ---------------------------------------------------------------------------
// Documentation coverage
// ---------------------------------------------------------------------------

/**
 * Check that all exported functions have JSDoc comments.
 * @param {string[]} files  - array of file contents (not paths)
 * @returns {Promise<{coverage: number, missing: string[], total: number}>}
 */
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

export default { blindReview, consensusGate, mutationDetect, antiSycophancyScore, backwardCompatCheck, documentationCoverage };
