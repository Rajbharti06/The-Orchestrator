/**
 * plannerAgent.js - Stack detection and phase planning
 *
 * First agent in the pipeline. Analyzes the user's prompt,
 * detects the technology stack, and creates a dependency graph of build phases.
 */

import { callLLM } from '../lib/llmRouter.js';
import { promptEnhancer } from '../lib/promptEnhancer.js';

const SYSTEM = `You are the Planner Agent for Orchestrator X, an autonomous AI software engineering system.

Your job: analyze the user's prompt, detect the technology stack, and output a structured build plan.

CRITICAL RULES:
1. Return ONLY valid JSON — no markdown, no prose
2. Detect the EXACT stack from the prompt; never assume
3. Backend and UI phases MUST have "parallel": true
4. Always include qa, fix, run, and test phases
5. Add deploy phase ONLY if explicitly asked

OUTPUT FORMAT:
{
  "stack": {
    "backend": "fastapi|express|django|gin|springboot|none",
    "frontend": "react|vue|nextjs|svelte|none",
    "db": "postgresql|mysql|sqlite|mongodb|none",
    "auth": "jwt|oauth|session|none",
    "cache": "redis|none",
    "extras": []
  },
  "phases": [
    {
      "id": "plan",
      "agent": "planner",
      "description": "Stack detected, phases defined",
      "deps": [],
      "parallel": false,
      "estimatedMinutes": 1
    },
    {
      "id": "arch",
      "agent": "architect",
      "description": "File structure, API contracts, DB schema",
      "deps": ["plan"],
      "parallel": false,
      "estimatedMinutes": 2
    },
    {
      "id": "backend",
      "agent": "backend",
      "description": "Generate all backend code",
      "deps": ["arch"],
      "parallel": true,
      "estimatedMinutes": 5
    },
    {
      "id": "ui",
      "agent": "ui",
      "description": "Generate all frontend code",
      "deps": ["arch"],
      "parallel": true,
      "estimatedMinutes": 5
    },
    {
      "id": "qa",
      "agent": "qa",
      "description": "Security and contract audit",
      "deps": ["backend", "ui"],
      "parallel": false,
      "estimatedMinutes": 2
    },
    {
      "id": "fix",
      "agent": "fix",
      "description": "Fix all QA issues",
      "deps": ["qa"],
      "parallel": false,
      "estimatedMinutes": 3
    },
    {
      "id": "run",
      "agent": "run",
      "description": "Boot application",
      "deps": ["fix"],
      "parallel": false,
      "estimatedMinutes": 1
    },
    {
      "id": "test",
      "agent": "apiTester",
      "description": "Test all API endpoints",
      "deps": ["run"],
      "parallel": false,
      "estimatedMinutes": 2
    }
  ],
  "complexity": "simple|medium|complex",
  "estimatedMinutes": 21,
  "notes": "Any special notes about this build"
}`;

/**
 * Run the planner agent.
 * @param {string} prompt - User's build request
 * @param {Object} [context] - Shared build context
 * @returns {Promise<Object>} Build plan
 */
export async function runPlanner(prompt, context = {}) {
  const enhanced = promptEnhancer.enhancePrompt(
    `Analyze this build request and create a detailed plan:\n\n${prompt}`,
    { task: 'planning', includeLessons: true, includeInstincts: true, includeSuccesses: true }
  );

  const raw = await callLLM({
    prompt: enhanced,
    system: SYSTEM,
    task: 'planning',
    maxTokens: 2000,
  });

  const plan = parsePlan(raw, prompt);

  return {
    ...plan,
    timestamp: new Date().toISOString(),
    originalPrompt: prompt,
  };
}

/**
 * Parse and validate the plan JSON from LLM output.
 * @param {string} raw
 * @param {string} prompt
 * @returns {Object}
 */
function parsePlan(raw, prompt) {
  try {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = raw.match(/```(?:json)?\n?([\s\S]*?)```/) || [null, raw];
    const jsonStr = jsonMatch[1];

    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.stack || !parsed.phases) {
      throw new Error('Missing required fields');
    }

    return parsed;
  } catch {
    // Return a safe default plan
    return buildDefaultPlan(prompt);
  }
}

/**
 * Build a default plan when parsing fails.
 * @param {string} prompt
 * @returns {Object}
 */
function buildDefaultPlan(prompt) {
  const lower = prompt.toLowerCase();

  const stack = {
    backend: lower.includes('fastapi') ? 'fastapi'
      : lower.includes('express') || lower.includes('node') ? 'express'
      : lower.includes('django') ? 'django'
      : lower.includes('gin') || lower.includes('golang') ? 'gin'
      : 'express',
    frontend: lower.includes('react') ? 'react'
      : lower.includes('vue') ? 'vue'
      : lower.includes('next') ? 'nextjs'
      : lower.includes('svelte') ? 'svelte'
      : 'react',
    db: lower.includes('postgres') ? 'postgresql'
      : lower.includes('mysql') ? 'mysql'
      : lower.includes('mongo') ? 'mongodb'
      : 'sqlite',
    auth: lower.includes('jwt') ? 'jwt' : lower.includes('oauth') ? 'oauth' : 'jwt',
    cache: lower.includes('redis') ? 'redis' : 'none',
    extras: [],
  };

  return {
    stack,
    phases: [
      { id: 'plan', agent: 'planner', description: 'Planning', deps: [], parallel: false, estimatedMinutes: 1 },
      { id: 'arch', agent: 'architect', description: 'Architecture', deps: ['plan'], parallel: false, estimatedMinutes: 2 },
      { id: 'backend', agent: 'backend', description: 'Backend', deps: ['arch'], parallel: true, estimatedMinutes: 5 },
      { id: 'ui', agent: 'ui', description: 'Frontend', deps: ['arch'], parallel: true, estimatedMinutes: 5 },
      { id: 'qa', agent: 'qa', description: 'QA', deps: ['backend', 'ui'], parallel: false, estimatedMinutes: 2 },
      { id: 'fix', agent: 'fix', description: 'Fix', deps: ['qa'], parallel: false, estimatedMinutes: 3 },
      { id: 'run', agent: 'run', description: 'Run', deps: ['fix'], parallel: false, estimatedMinutes: 1 },
      { id: 'test', agent: 'apiTester', description: 'Test', deps: ['run'], parallel: false, estimatedMinutes: 2 },
    ],
    complexity: 'medium',
    estimatedMinutes: 21,
    notes: 'Default plan (parser fallback)',
  };
}

export default { runPlanner };
