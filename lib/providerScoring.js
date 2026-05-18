/**
 * providerScoring.js - LLM provider scoring and ranking
 *
 * Tracks success/failure rates per provider per task type.
 * Returns optimally ordered provider list for routing decisions.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCORES_PATH = join(__dirname, '..', 'memory', 'providers.json');

// Default scores (0-100) per provider per task
const DEFAULT_SCORES = {
  anthropic: { planning: 95, coding: 90, qa: 85, search: 80, default: 90 },
  openai: { planning: 88, coding: 85, qa: 82, search: 88, default: 85 },
  groq: { planning: 75, coding: 72, qa: 88, search: 70, default: 75 },
  xai: { planning: 80, coding: 78, qa: 75, search: 78, default: 78 },
  mistral: { planning: 78, coding: 82, qa: 75, search: 72, default: 78 },
  gemini: { planning: 82, coding: 80, qa: 78, search: 82, default: 80 },
  deepseek: { planning: 75, coding: 85, qa: 72, search: 70, default: 78 },
  openrouter: { planning: 82, coding: 82, qa: 80, search: 80, default: 82 },
  ollama: { planning: 55, coding: 60, qa: 55, search: 50, default: 55 },
};

let scores = {};

function ensureMemoryDir() {
  const memDir = join(__dirname, '..', 'memory');
  if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });
}

function loadScores() {
  try {
    ensureMemoryDir();
    if (existsSync(SCORES_PATH)) {
      scores = JSON.parse(readFileSync(SCORES_PATH, 'utf-8'));
    } else {
      scores = JSON.parse(JSON.stringify(DEFAULT_SCORES));
      saveScores();
    }
  } catch {
    scores = JSON.parse(JSON.stringify(DEFAULT_SCORES));
  }
}

function saveScores() {
  try {
    ensureMemoryDir();
    writeFileSync(SCORES_PATH, JSON.stringify(scores, null, 2));
  } catch {
    // Non-critical, continue
  }
}

// Initialize on load
loadScores();

/**
 * Record a successful LLM call for a provider+task
 * @param {string} provider
 * @param {string} task
 */
function recordSuccess(provider, task) {
  if (!scores[provider]) scores[provider] = { ...DEFAULT_SCORES.anthropic };
  const current = scores[provider][task] || scores[provider].default || 75;
  // Move score toward 100 by 2 points, capped at 100
  scores[provider][task] = Math.min(100, current + 2);
  saveScores();
}

/**
 * Record a failed LLM call for a provider+task
 * @param {string} provider
 * @param {string} task
 */
function recordFailure(provider, task) {
  if (!scores[provider]) scores[provider] = { ...DEFAULT_SCORES.anthropic };
  const current = scores[provider][task] || scores[provider].default || 75;
  // Move score toward 0 by 5 points (failures penalized more than successes gain)
  scores[provider][task] = Math.max(0, current - 5);
  saveScores();
}

/**
 * Get providers ordered by score for a given task
 * @param {string} task
 * @returns {string[]} Provider names ordered best-to-worst
 */
function getOrderedProviders(task) {
  return Object.entries(scores)
    .map(([name, taskScores]) => ({
      name,
      score: taskScores[task] || taskScores.default || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .map((p) => p.name);
}

/**
 * Get the score for a specific provider+task
 * @param {string} provider
 * @param {string} task
 * @returns {number} Score 0-100
 */
function getScore(provider, task) {
  return scores[provider]?.[task] || scores[provider]?.default || 0;
}

/**
 * Get all scores
 * @returns {Object}
 */
function getAllScores() {
  return JSON.parse(JSON.stringify(scores));
}

/**
 * Reset scores to defaults
 */
function resetScores() {
  scores = JSON.parse(JSON.stringify(DEFAULT_SCORES));
  saveScores();
}

/**
 * Set score for a provider+task directly (for manual override)
 * @param {string} provider
 * @param {string} task
 * @param {number} score
 */
function setScore(provider, task, score) {
  if (!scores[provider]) scores[provider] = {};
  scores[provider][task] = Math.max(0, Math.min(100, score));
  saveScores();
}

export const providerScoring = {
  recordSuccess,
  recordFailure,
  getOrderedProviders,
  getScore,
  getAllScores,
  resetScores,
  setScore,
};

export default providerScoring;
