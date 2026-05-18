/**
 * evalEngine.js - Self-scoring evaluation suite
 *
 * Runs 8 test cases through the full pipeline (or mock) and scores outputs.
 * Tracks score history and identifies weak areas for autonomous improvement.
 */

import { callLLM } from './llmRouter.js';

const EVAL_CASES = [
  {
    id: 'hello-api',
    name: 'Hello World API',
    prompt: 'Create a simple Express.js REST API with a GET /hello endpoint that returns { message: "Hello World" }',
    expectedPatterns: ['express', 'app.get', '/hello', 'Hello World', 'listen'],
    task: 'coding',
    weight: 1,
  },
  {
    id: 'jwt-auth',
    name: 'JWT Authentication',
    prompt: 'Create a FastAPI backend with JWT authentication: POST /login returns a token, GET /me requires the token',
    expectedPatterns: ['fastapi', 'jwt', 'token', 'Depends', 'POST.*login', 'GET.*me'],
    task: 'coding',
    weight: 2,
  },
  {
    id: 'react-form',
    name: 'React Form',
    prompt: 'Create a React form with email and password fields that calls a POST /login API',
    expectedPatterns: ['useState', 'fetch', 'POST', 'login', 'email', 'password'],
    task: 'coding',
    weight: 1,
  },
  {
    id: 'crud-api',
    name: 'CRUD API',
    prompt: 'Create a Node.js Express REST API with full CRUD for a "tasks" resource: GET /tasks, POST /tasks, PUT /tasks/:id, DELETE /tasks/:id',
    expectedPatterns: ['GET.*tasks', 'POST.*tasks', 'PUT.*tasks', 'DELETE.*tasks', 'id'],
    task: 'coding',
    weight: 2,
  },
  {
    id: 'stack-detection',
    name: 'Stack Detection',
    prompt: 'Plan a build for: FastAPI backend with React frontend and PostgreSQL database with JWT auth',
    expectedPatterns: ['fastapi', 'react', 'postgresql', 'jwt', 'plan', 'phase'],
    task: 'planning',
    weight: 2,
  },
  {
    id: 'security-review',
    name: 'Security Review',
    prompt: 'Review this code for security issues: SECRET_KEY = "hardcoded-secret-123"',
    expectedPatterns: ['secret', 'hardcoded', 'environment', 'env', 'vulnerable'],
    task: 'qa',
    weight: 2,
  },
  {
    id: 'db-schema',
    name: 'Database Schema',
    prompt: 'Design a PostgreSQL schema for a multi-tenant SaaS app with users, organizations, and subscriptions',
    expectedPatterns: ['CREATE TABLE', 'users', 'organizations', 'foreign key', 'id'],
    task: 'planning',
    weight: 1,
  },
  {
    id: 'deployment-plan',
    name: 'Deployment Plan',
    prompt: 'Create a deployment plan for a FastAPI + React app to Railway with environment variables and health checks',
    expectedPatterns: ['railway', 'deploy', 'environment', 'health', 'PORT'],
    task: 'planning',
    weight: 1,
  },
];

/** @type {{ timestamp: string, score: number, results: any[] }[]} */
let scoreHistory = [];

/**
 * Score a single output against expected patterns.
 * @param {string} output
 * @param {string[]} patterns
 * @returns {number} Score 0-100
 */
function scoreOutput(output, patterns) {
  if (!output || output.length < 10) return 0;

  const outputLower = output.toLowerCase();
  let matched = 0;

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(outputLower)) matched++;
    } catch {
      if (outputLower.includes(pattern.toLowerCase())) matched++;
    }
  }

  const patternScore = (matched / patterns.length) * 80;
  const lengthScore = Math.min(20, output.length / 100);
  return Math.round(patternScore + lengthScore);
}

/**
 * Run a single eval case.
 * @param {Object} evalCase
 * @returns {Promise<Object>}
 */
async function runCase(evalCase) {
  const start = Date.now();

  try {
    const output = await callLLM({
      prompt: evalCase.prompt,
      task: evalCase.task,
      maxTokens: 1500,
    });

    const score = scoreOutput(output, evalCase.expectedPatterns);
    const latencyMs = Date.now() - start;

    return {
      id: evalCase.id,
      name: evalCase.name,
      score,
      passed: score >= 60,
      latencyMs,
      outputLength: output.length,
      matchedPatterns: evalCase.expectedPatterns.filter((p) => {
        try { return new RegExp(p, 'i').test(output); } catch { return output.toLowerCase().includes(p.toLowerCase()); }
      }),
      weight: evalCase.weight,
    };
  } catch (err) {
    return {
      id: evalCase.id,
      name: evalCase.name,
      score: 0,
      passed: false,
      error: err.message,
      latencyMs: Date.now() - start,
      outputLength: 0,
      matchedPatterns: [],
      weight: evalCase.weight,
    };
  }
}

/**
 * Run the full eval suite.
 * @param {Object} [opts]
 * @param {boolean} [opts.parallel=true] - Run cases in parallel
 * @param {string[]} [opts.caseIds] - Run specific cases only
 * @returns {Promise<Object>} Eval result with score and case results
 */
export async function runEvalSuite({ parallel = true, caseIds } = {}) {
  const cases = caseIds ? EVAL_CASES.filter((c) => caseIds.includes(c.id)) : EVAL_CASES;

  let results;
  if (parallel) {
    results = await Promise.all(cases.map(runCase));
  } else {
    results = [];
    for (const c of cases) {
      results.push(await runCase(c));
    }
  }

  const totalWeight = results.reduce((s, r) => s + r.weight, 0);
  const weightedScore = results.reduce((s, r) => s + r.score * r.weight, 0) / totalWeight;
  const overallScore = Math.round(weightedScore);

  const entry = {
    timestamp: new Date().toISOString(),
    score: overallScore,
    results,
    passedCount: results.filter((r) => r.passed).length,
    totalCount: results.length,
    avgLatencyMs: Math.round(results.reduce((s, r) => s + (r.latencyMs || 0), 0) / results.length),
  };

  scoreHistory.unshift(entry);
  if (scoreHistory.length > 50) scoreHistory.pop();

  return entry;
}

/**
 * Get score trend: 'improving' | 'declining' | 'stable'
 * @returns {string}
 */
export function getTrend() {
  if (scoreHistory.length < 3) return 'stable';

  const recent = scoreHistory.slice(0, 3).map((e) => e.score);
  const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const older = scoreHistory.slice(3, 6).map((e) => e.score);

  if (older.length === 0) return 'stable';

  const oldAvg = older.reduce((s, v) => s + v, 0) / older.length;

  if (avg > oldAvg + 3) return 'improving';
  if (avg < oldAvg - 3) return 'declining';
  return 'stable';
}

/**
 * Get weak areas (consistently low-scoring eval cases).
 * @returns {{ id: string, name: string, avgScore: number }[]}
 */
export function getWeakAreas() {
  if (scoreHistory.length === 0) return [];

  const caseTotals = {};
  for (const entry of scoreHistory.slice(0, 10)) {
    for (const r of entry.results) {
      if (!caseTotals[r.id]) caseTotals[r.id] = { name: r.name, scores: [] };
      caseTotals[r.id].scores.push(r.score);
    }
  }

  return Object.entries(caseTotals)
    .map(([id, { name, scores }]) => ({
      id,
      name,
      avgScore: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
    }))
    .filter((a) => a.avgScore < 65)
    .sort((a, b) => a.avgScore - b.avgScore);
}

/**
 * Get the latest eval result.
 * @returns {Object|null}
 */
export function getLatestResult() {
  return scoreHistory[0] || null;
}

/**
 * Get full score history.
 * @returns {Object[]}
 */
export function getScoreHistory() {
  return [...scoreHistory];
}

/**
 * Get all available eval case definitions.
 * @returns {Object[]}
 */
export function getEvalCases() {
  return EVAL_CASES.map(({ id, name, prompt, task, weight }) => ({ id, name, prompt, task, weight }));
}

export const evalEngine = {
  runEvalSuite,
  getTrend,
  getWeakAreas,
  getLatestResult,
  getScoreHistory,
  getEvalCases,
};

export default evalEngine;
