/**
 * strategyLayer.js - Goal decomposition and dependency graph generation
 *
 * For complex prompts, decomposes the goal into phases with success criteria.
 * Simple prompts skip decomposition to keep latency low.
 */

import { callLLM } from './llmRouter.js';

/**
 * @typedef {Object} Phase
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string[]} successCriteria
 * @property {string[]} deps - Phase IDs this depends on
 * @property {boolean} [parallel] - Can run in parallel with other phases
 * @property {number} estimatedMinutes
 */

/**
 * @typedef {Object} Strategy
 * @property {string} goal - Cleaned goal statement
 * @property {string} complexity - 'simple' | 'medium' | 'complex'
 * @property {Phase[]} phases
 * @property {string[]} risks - Identified risks
 * @property {string[]} constraints - Known constraints
 * @property {string} approach - Recommended approach description
 */

/**
 * Determine if a prompt is complex enough to warrant full decomposition.
 * @param {string} prompt
 * @returns {boolean}
 */
export function isComplexPrompt(prompt) {
  if (prompt.length > 150) return true;

  const complexitySignals = [
    'and', 'with', 'including', 'plus', 'also',
    'authentication', 'database', 'deploy', 'full-stack',
    'frontend', 'backend', 'api', 'auth', 'payment',
    'realtime', 'websocket', 'microservice', 'scalable',
  ];

  const lower = prompt.toLowerCase();
  const signalCount = complexitySignals.filter((s) => lower.includes(s)).length;
  return signalCount >= 2;
}

/**
 * Decompose a complex goal into phases using LLM.
 * @param {string} prompt - User's goal
 * @returns {Promise<Strategy>}
 */
export async function decomposeGoal(prompt) {
  if (!isComplexPrompt(prompt)) {
    return buildSimpleStrategy(prompt);
  }

  const systemPrompt = `You are a senior software architect decomposing a software engineering goal into an execution plan.

Return ONLY valid JSON matching this exact schema:
{
  "goal": "cleaned goal statement",
  "complexity": "simple|medium|complex",
  "approach": "one sentence describing the recommended approach",
  "risks": ["risk1", "risk2"],
  "constraints": ["constraint1"],
  "phases": [
    {
      "id": "phase-id",
      "name": "Phase Name",
      "description": "What this phase does",
      "successCriteria": ["criterion1", "criterion2"],
      "deps": ["previous-phase-id"],
      "parallel": false,
      "estimatedMinutes": 5
    }
  ]
}

Rules:
- Backend and UI phases MUST be parallel (parallel: true)
- Always include: plan → arch → backend+ui → qa → fix → run → test
- Add deployment phase only if explicitly requested
- Keep phase count between 5-9
- Success criteria must be measurable and specific`;

  try {
    const raw = await callLLM({
      prompt: `Decompose this goal into phases:\n\n${prompt}`,
      system: systemPrompt,
      task: 'planning',
      maxTokens: 2000,
    });

    const json = extractJSON(raw);
    const strategy = JSON.parse(json);
    return validateStrategy(strategy, prompt);
  } catch {
    return buildSimpleStrategy(prompt);
  }
}

/**
 * Build a simple strategy for straightforward prompts.
 * @param {string} prompt
 * @returns {Strategy}
 */
function buildSimpleStrategy(prompt) {
  return {
    goal: prompt,
    complexity: 'simple',
    approach: 'Standard 8-phase build pipeline',
    risks: [],
    constraints: [],
    phases: [
      {
        id: 'plan',
        name: 'Planning',
        description: 'Detect stack, create build plan',
        successCriteria: ['Stack identified', 'Phases defined'],
        deps: [],
        parallel: false,
        estimatedMinutes: 1,
      },
      {
        id: 'arch',
        name: 'Architecture',
        description: 'Design file structure, API contracts, DB schema',
        successCriteria: ['File structure defined', 'API endpoints specified'],
        deps: ['plan'],
        parallel: false,
        estimatedMinutes: 2,
      },
      {
        id: 'backend',
        name: 'Backend',
        description: 'Generate backend code',
        successCriteria: ['All endpoints implemented', 'Auth working'],
        deps: ['arch'],
        parallel: true,
        estimatedMinutes: 5,
      },
      {
        id: 'ui',
        name: 'Frontend',
        description: 'Generate frontend code',
        successCriteria: ['All views implemented', 'API calls wired up'],
        deps: ['arch'],
        parallel: true,
        estimatedMinutes: 5,
      },
      {
        id: 'qa',
        name: 'QA Audit',
        description: 'Security + contract validation',
        successCriteria: ['No critical issues', 'Score >= 70'],
        deps: ['backend', 'ui'],
        parallel: false,
        estimatedMinutes: 2,
      },
      {
        id: 'fix',
        name: 'Fix',
        description: 'Resolve QA issues',
        successCriteria: ['All blockers resolved'],
        deps: ['qa'],
        parallel: false,
        estimatedMinutes: 3,
      },
      {
        id: 'run',
        name: 'Run',
        description: 'Boot app, verify startup',
        successCriteria: ['App listening on expected port'],
        deps: ['fix'],
        parallel: false,
        estimatedMinutes: 1,
      },
      {
        id: 'test',
        name: 'API Tests',
        description: 'Make real HTTP calls to all endpoints',
        successCriteria: ['All endpoints return 2xx'],
        deps: ['run'],
        parallel: false,
        estimatedMinutes: 2,
      },
    ],
  };
}

/**
 * Validate and normalize a strategy object.
 * @param {any} raw
 * @param {string} prompt
 * @returns {Strategy}
 */
function validateStrategy(raw, prompt) {
  if (!raw.phases || !Array.isArray(raw.phases)) {
    return buildSimpleStrategy(prompt);
  }

  return {
    goal: raw.goal || prompt,
    complexity: raw.complexity || 'medium',
    approach: raw.approach || 'Standard build pipeline',
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
    phases: raw.phases.map((p) => ({
      id: p.id || `phase-${Math.random().toString(36).slice(2, 6)}`,
      name: p.name || 'Phase',
      description: p.description || '',
      successCriteria: Array.isArray(p.successCriteria) ? p.successCriteria : [],
      deps: Array.isArray(p.deps) ? p.deps : [],
      parallel: Boolean(p.parallel),
      estimatedMinutes: Number(p.estimatedMinutes) || 5,
    })),
  };
}

/**
 * Extract JSON from a string that may contain markdown code blocks.
 * @param {string} text
 * @returns {string}
 */
function extractJSON(text) {
  const codeBlock = text.match(/```(?:json)?\n?([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    return text.slice(jsonStart, jsonEnd + 1);
  }

  return text;
}

/**
 * Get a human-readable summary of a strategy.
 * @param {Strategy} strategy
 * @returns {string}
 */
export function formatStrategy(strategy) {
  const lines = [
    `## Build Strategy`,
    `**Goal**: ${strategy.goal}`,
    `**Complexity**: ${strategy.complexity}`,
    `**Approach**: ${strategy.approach}`,
    `**Total phases**: ${strategy.phases.length}`,
    `**Estimated time**: ${strategy.phases.reduce((s, p) => s + p.estimatedMinutes, 0)} minutes`,
    '',
  ];

  if (strategy.risks.length > 0) {
    lines.push(`**Risks**: ${strategy.risks.join(', ')}`);
  }

  lines.push('', '### Phases:');
  for (const phase of strategy.phases) {
    const parallel = phase.parallel ? ' [parallel]' : '';
    const deps = phase.deps.length > 0 ? ` (after: ${phase.deps.join(', ')})` : '';
    lines.push(`${phase.id}: ${phase.name}${parallel}${deps} — ~${phase.estimatedMinutes}min`);
  }

  return lines.join('\n');
}

export const strategyLayer = { decomposeGoal, isComplexPrompt, formatStrategy, buildSimpleStrategy };
export default strategyLayer;
