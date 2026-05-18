/**
 * multiEngine.js - Multi-CLI runtime engine abstraction
 *
 * Provides a unified interface for running Claude Code, Codex, Gemini,
 * Cursor Agent, OpenCode, or any custom CLI as a swappable engine.
 * Inspired by claw-orchestrator's multi-engine.md architecture.
 */

import { callLLM } from './llmRouter.js';

const ENGINES = {
  claude: {
    name: 'Claude Code',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    capabilities: { maxContext: 200_000, toolUse: true, streaming: true, vision: true },
    taskStrengths: ['planning', 'architecture', 'backend', 'frontend', 'qa', 'research'],
  },
  codex: {
    name: 'OpenAI Codex',
    provider: 'openai',
    model: 'gpt-4o',
    capabilities: { maxContext: 128_000, toolUse: true, streaming: true, vision: false },
    taskStrengths: ['data-science', 'python', 'ml', 'backend'],
  },
  gemini: {
    name: 'Gemini',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    capabilities: { maxContext: 1_000_000, toolUse: true, streaming: true, vision: true },
    taskStrengths: ['long-context', 'multimodal', 'research'],
  },
  opencode: {
    name: 'OpenCode',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    capabilities: { maxContext: 200_000, toolUse: true, streaming: true, vision: false },
    taskStrengths: ['backend', 'frontend', 'general'],
  },
};

const TASK_ROUTING = {
  planning:      'claude',
  architecture:  'claude',
  backend:       'claude',
  frontend:      'claude',
  qa:            'claude',
  research:      'claude',
  security:      'claude',
  'data-science': 'codex',
  'long-context': 'gemini',
  multimodal:    'gemini',
  default:       'claude',
};

const customEngines = new Map();

/**
 * Register a custom engine.
 * @param {string} id - Engine identifier
 * @param {Object} config - Engine config
 */
export function registerEngine(id, engineConfig) {
  customEngines.set(id, {
    name: engineConfig.name || id,
    capabilities: engineConfig.capabilities || {},
    taskStrengths: engineConfig.taskStrengths || ['general'],
    _custom: true,
    ...engineConfig,
  });
}

/**
 * Get the best engine for a task type.
 * @param {string} taskType
 * @param {string} [preferredEngine] - Override auto-selection
 * @returns {Object} Engine config
 */
export function selectEngine(taskType, preferredEngine) {
  const engineId = preferredEngine
    || process.env.ENGINE
    || TASK_ROUTING[taskType]
    || TASK_ROUTING.default;

  return getEngine(engineId);
}

/**
 * Get engine config by ID.
 * @param {string} engineId
 * @returns {Object}
 */
export function getEngine(engineId) {
  if (customEngines.has(engineId)) return customEngines.get(engineId);
  return ENGINES[engineId] || ENGINES.claude;
}

/**
 * List all available engines.
 * @returns {Array<{id, name, taskStrengths, capabilities}>}
 */
export function listEngines() {
  const builtIn = Object.entries(ENGINES).map(([id, e]) => ({ id, ...e }));
  const custom = [...customEngines.entries()].map(([id, e]) => ({ id, ...e }));
  return [...builtIn, ...custom];
}

/**
 * Run a task through the selected engine.
 * Falls back through the fallback chain on error.
 *
 * @param {Object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.taskType]
 * @param {string} [opts.engine] - Preferred engine ID
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.systemPrompt]
 * @returns {Promise<string>}
 */
export async function runWithEngine({ prompt, taskType = 'default', engine, maxTokens = 4000, systemPrompt }) {
  const FALLBACK_CHAIN = ['claude', 'gemini', 'codex', 'opencode'];
  const selectedEngine = selectEngine(taskType, engine);

  const tryEngines = [selectedEngine.id || engine || 'claude', ...FALLBACK_CHAIN].filter(
    (id, idx, arr) => arr.indexOf(id) === idx
  );

  let lastError;
  for (const engineId of tryEngines) {
    const eng = getEngine(engineId);

    try {
      const result = await callLLM({
        prompt,
        systemPrompt,
        provider: eng.provider,
        model: eng.model,
        task: taskType,
        maxTokens,
      });
      return result;
    } catch (err) {
      lastError = err;
      // Try next engine in fallback chain
    }
  }

  throw new Error(`All engines failed. Last error: ${lastError?.message}`);
}

/**
 * Get the fallback chain starting from an engine.
 * @param {string} startEngine
 * @returns {string[]}
 */
export function getFallbackChain(startEngine = 'claude') {
  const all = ['claude', 'gemini', 'codex', 'opencode'];
  const rest = all.filter(e => e !== startEngine);
  return [startEngine, ...rest];
}

export default { registerEngine, selectEngine, getEngine, listEngines, runWithEngine, getFallbackChain };
