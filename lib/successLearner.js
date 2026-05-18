/**
 * successLearner.js - Success pattern extraction and learning
 *
 * Records what worked well during builds. Extracts reusable patterns.
 * Feeds successful patterns into instinctStore as new instincts.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { instinctStore } from './instinctStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUCCESSES_PATH = join(__dirname, '..', 'memory', 'successes.json');

/**
 * @typedef {Object} SuccessPattern
 * @property {string} id
 * @property {string} pattern - What worked
 * @property {string} context - When it applied
 * @property {string} stack - Tech stack
 * @property {string[]} tags
 * @property {number} score - Build quality score 0-100
 * @property {string} created - ISO timestamp
 * @property {number} uses - Times reused
 */

let successes = [];

function ensureMemoryDir() {
  const memDir = join(__dirname, '..', 'memory');
  if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });
}

function loadSuccesses() {
  try {
    ensureMemoryDir();
    if (existsSync(SUCCESSES_PATH)) {
      successes = JSON.parse(readFileSync(SUCCESSES_PATH, 'utf-8'));
    }
  } catch {
    successes = [];
  }
}

function saveSuccesses() {
  try {
    ensureMemoryDir();
    writeFileSync(SUCCESSES_PATH, JSON.stringify(successes, null, 2));
  } catch {
    // Non-critical
  }
}

loadSuccesses();

/**
 * Record a successful build pattern.
 * @param {Object} opts
 * @param {string} opts.pattern - What worked
 * @param {string} opts.context - When it applies
 * @param {string} [opts.stack] - Tech stack
 * @param {string[]} [opts.tags] - Tags
 * @param {number} [opts.score=100] - Quality score
 */
export function recordSuccess({ pattern, context, stack = '', tags = [], score = 100 }) {
  const existing = successes.find(
    (s) => s.pattern.toLowerCase().slice(0, 50) === pattern.toLowerCase().slice(0, 50)
  );

  if (existing) {
    existing.uses++;
    existing.score = Math.round((existing.score + score) / 2); // Rolling average
    saveSuccesses();

    // If this pattern has been seen multiple times with high score, elevate to instinct
    if (existing.uses >= 2 && existing.score >= 80) {
      instinctStore.addInstinct({
        pattern: existing.pattern,
        context: existing.context,
        tags: existing.tags,
        evidence: `Successful ${existing.uses} times with avg score ${existing.score}`,
        initialConfidence: Math.min(0.9, 0.5 + existing.uses * 0.1),
      });
    }

    return existing;
  }

  const successPattern = {
    id: randomUUID(),
    pattern,
    context,
    stack,
    tags,
    score,
    created: new Date().toISOString(),
    uses: 1,
  };

  successes.push(successPattern);
  saveSuccesses();

  // High-scoring first-time patterns go directly to instincts
  if (score >= 90) {
    instinctStore.addInstinct({
      pattern,
      context,
      tags,
      evidence: `First-time success with score ${score}`,
      initialConfidence: 0.6,
    });
  }

  return successPattern;
}

/**
 * Extract success patterns from a completed build.
 * @param {Object} buildResult
 * @param {string} buildResult.prompt
 * @param {string} buildResult.stack
 * @param {number} buildResult.qaScore
 * @param {number} buildResult.testPassRate - 0-1
 * @param {string[]} buildResult.phases - Completed phase names
 * @param {Object} [buildResult.architecture]
 */
export function extractFromBuild({ prompt, stack, qaScore, testPassRate, phases, architecture }) {
  const score = Math.round((qaScore + testPassRate * 100) / 2);
  if (score < 70) return; // Only learn from good builds

  const tags = [stack, ...phases];

  // Pattern 1: Stack detection worked
  if (stack) {
    recordSuccess({
      pattern: `Detected stack "${stack}" correctly and built full-stack app`,
      context: 'stack detection',
      stack,
      tags: [stack, 'detection'],
      score,
    });
  }

  // Pattern 2: All phases completed
  if (phases.length >= 6) {
    recordSuccess({
      pattern: 'Full pipeline completion: all 8 phases succeeded',
      context: 'pipeline orchestration',
      stack,
      tags,
      score,
    });
  }

  // Pattern 3: High QA score
  if (qaScore >= 85) {
    recordSuccess({
      pattern: `QA audit passed with score ${qaScore}/100 for ${stack} stack`,
      context: 'quality assurance',
      stack,
      tags: [stack, 'qa', 'quality'],
      score: qaScore,
    });
  }

  // Pattern 4: Architecture worked
  if (architecture && testPassRate >= 0.8) {
    recordSuccess({
      pattern: `Architecture design led to ${Math.round(testPassRate * 100)}% test pass rate`,
      context: 'architecture',
      stack,
      tags: [stack, 'architecture', 'api'],
      score,
    });
  }
}

/**
 * Get success patterns relevant to current context.
 * @param {Object} opts
 * @param {string} [opts.stack]
 * @param {string[]} [opts.tags]
 * @param {number} [opts.limit=5]
 * @returns {SuccessPattern[]}
 */
export function getRelevantSuccesses({ stack = '', tags = [], limit = 5 } = {}) {
  const stackLower = stack.toLowerCase();
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  return successes
    .filter((s) => {
      const stackMatch = !stack || s.stack.toLowerCase().includes(stackLower);
      const tagMatch = tags.length === 0 || s.tags.some((t) => tagSet.has(t.toLowerCase()));
      return stackMatch || tagMatch;
    })
    .sort((a, b) => b.score - a.score || b.uses - a.uses)
    .slice(0, limit);
}

/**
 * Get all success patterns.
 * @returns {SuccessPattern[]}
 */
export function getAllSuccesses() {
  return [...successes].sort((a, b) => b.score - a.score);
}

/**
 * Format success patterns for prompt injection.
 * @param {SuccessPattern[]} patterns
 * @returns {string}
 */
export function formatSuccessesForPrompt(patterns) {
  if (!patterns || patterns.length === 0) return '';

  const lines = ['## Proven Patterns (these have worked well):\n'];
  for (const s of patterns) {
    lines.push(`- ${s.pattern} (score: ${s.score}/100, used ${s.uses}x)`);
  }
  return lines.join('\n');
}

export const successLearner = {
  recordSuccess,
  extractFromBuild,
  getRelevantSuccesses,
  getAllSuccesses,
  formatSuccessesForPrompt,
};

export default successLearner;
