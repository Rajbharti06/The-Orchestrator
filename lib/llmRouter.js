/**
 * llmRouter.js - Multi-provider LLM router with automatic fallback
 *
 * Supports: Anthropic, OpenAI, Groq, xAI/Grok, Mistral, Gemini, DeepSeek, OpenRouter, Ollama
 * Features: task-based routing, provider scoring, retry logic, mock mode, cost tracking
 */

import fetch from 'node-fetch';
import { providerScoring } from './providerScoring.js';

// ---------------------------------------------------------------------------
// Mock responses for MOCK=true mode
// ---------------------------------------------------------------------------
const MOCK_RESPONSES = {
  planning: `{"stack":{"backend":"express","frontend":"react","db":"sqlite"},"phases":[{"id":"plan","agent":"planner","deps":[]},{"id":"arch","agent":"architect","deps":["plan"]},{"id":"backend","agent":"backend","deps":["arch"],"parallel":true},{"id":"ui","agent":"ui","deps":["arch"],"parallel":true},{"id":"qa","agent":"qa","deps":["backend","ui"]},{"id":"fix","agent":"fix","deps":["qa"]},{"id":"run","agent":"run","deps":["fix"]},{"id":"test","agent":"apiTester","deps":["run"]}],"complexity":"medium","estimatedMinutes":5}`,
  coding: `// Generated code\nexport function main() {\n  console.log("Hello from Orchestrator X");\n}\nmain();`,
  qa: `{"passed":true,"issues":[],"score":95}`,
  default: `Task completed successfully.`,
};

// ---------------------------------------------------------------------------
// Provider configurations
// ---------------------------------------------------------------------------
const PROVIDERS = {
  anthropic: {
    name: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModels: {
      planning: 'claude-opus-4-5',
      coding: 'claude-sonnet-4-5',
      qa: 'claude-haiku-3-5',
      default: 'claude-sonnet-4-5',
    },
    costPer1kTokens: { input: 0.003, output: 0.015 },
    maxTokens: 8192,
  },
  openai: {
    name: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    defaultModels: {
      planning: 'gpt-4o',
      coding: 'gpt-4o-mini',
      qa: 'gpt-4o-mini',
      default: 'gpt-4o-mini',
    },
    costPer1kTokens: { input: 0.005, output: 0.015 },
    maxTokens: 8192,
  },
  groq: {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    defaultModels: {
      planning: 'llama-3.1-70b-versatile',
      coding: 'llama-3.1-70b-versatile',
      qa: 'llama-3.1-8b-instant',
      default: 'llama-3.1-70b-versatile',
    },
    costPer1kTokens: { input: 0.0001, output: 0.0001 },
    maxTokens: 8192,
  },
  xai: {
    name: 'xai',
    baseUrl: 'https://api.x.ai/v1',
    envKey: 'XAI_API_KEY',
    defaultModels: {
      planning: 'grok-beta',
      coding: 'grok-beta',
      qa: 'grok-beta',
      default: 'grok-beta',
    },
    costPer1kTokens: { input: 0.005, output: 0.015 },
    maxTokens: 8192,
  },
  mistral: {
    name: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    envKey: 'MISTRAL_API_KEY',
    defaultModels: {
      planning: 'mistral-large-latest',
      coding: 'codestral-latest',
      qa: 'mistral-small-latest',
      default: 'mistral-large-latest',
    },
    costPer1kTokens: { input: 0.002, output: 0.006 },
    maxTokens: 8192,
  },
  gemini: {
    name: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GEMINI_API_KEY',
    defaultModels: {
      planning: 'gemini-1.5-pro',
      coding: 'gemini-1.5-flash',
      qa: 'gemini-1.5-flash',
      default: 'gemini-1.5-flash',
    },
    costPer1kTokens: { input: 0.00035, output: 0.00105 },
    maxTokens: 8192,
  },
  deepseek: {
    name: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModels: {
      planning: 'deepseek-reasoner',
      coding: 'deepseek-coder',
      qa: 'deepseek-chat',
      default: 'deepseek-chat',
    },
    costPer1kTokens: { input: 0.0001, output: 0.0002 },
    maxTokens: 8192,
  },
  openrouter: {
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    defaultModels: {
      planning: 'anthropic/claude-opus-4',
      coding: 'anthropic/claude-sonnet-4-5',
      qa: 'meta-llama/llama-3.1-8b-instruct:free',
      default: 'anthropic/claude-sonnet-4-5',
    },
    costPer1kTokens: { input: 0.003, output: 0.015 },
    maxTokens: 8192,
  },
  ollama: {
    name: 'ollama',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    envKey: null, // No key needed
    defaultModels: {
      planning: 'llama3.1',
      coding: 'codellama',
      qa: 'llama3.1',
      default: 'llama3.1',
    },
    costPer1kTokens: { input: 0, output: 0 },
    maxTokens: 8192,
  },
};

// ---------------------------------------------------------------------------
// Token / cost tracking
// ---------------------------------------------------------------------------
const usageStats = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUSD: 0,
  callCount: 0,
  byProvider: {},
};

function recordUsage(provider, model, inputTokens, outputTokens) {
  const cfg = PROVIDERS[provider];
  const cost =
    (inputTokens / 1000) * (cfg?.costPer1kTokens?.input || 0) +
    (outputTokens / 1000) * (cfg?.costPer1kTokens?.output || 0);

  usageStats.totalInputTokens += inputTokens;
  usageStats.totalOutputTokens += outputTokens;
  usageStats.totalCostUSD += cost;
  usageStats.callCount++;

  if (!usageStats.byProvider[provider]) {
    usageStats.byProvider[provider] = { calls: 0, cost: 0, tokens: 0 };
  }
  usageStats.byProvider[provider].calls++;
  usageStats.byProvider[provider].cost += cost;
  usageStats.byProvider[provider].tokens += inputTokens + outputTokens;
}

// ---------------------------------------------------------------------------
// Core call functions per provider format
// ---------------------------------------------------------------------------

/**
 * Call Anthropic API (different format from OpenAI)
 */
async function callAnthropic(apiKey, model, messages, maxTokens, systemPrompt) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages: messages.filter((m) => m.role !== 'system'),
  };
  if (systemPrompt) body.system = systemPrompt;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || '';
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  recordUsage('anthropic', model, inputTokens, outputTokens);
  return text;
}

/**
 * Call OpenAI-compatible API (OpenAI, Groq, xAI, Mistral, Gemini, DeepSeek, OpenRouter, Ollama)
 */
async function callOpenAICompat(providerName, apiKey, baseUrl, model, messages, maxTokens) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;
  if (providerName === 'openrouter') {
    headers['http-referer'] = 'https://github.com/rajbharti06/orchestrator-x';
    headers['x-title'] = 'Orchestrator X';
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`${providerName} ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '';
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  recordUsage(providerName, model, inputTokens, outputTokens);
  return text;
}

// ---------------------------------------------------------------------------
// Provider order (fallback chain)
// ---------------------------------------------------------------------------
function getProviderOrder(task) {
  // Get scored order from providerScoring, fallback to defaults
  const scored = providerScoring.getOrderedProviders(task);
  if (scored && scored.length > 0) return scored;

  const taskRoutes = {
    planning: ['anthropic', 'openai', 'groq', 'xai', 'openrouter'],
    coding: ['anthropic', 'mistral', 'openai', 'deepseek', 'groq'],
    qa: ['groq', 'anthropic', 'openai', 'mistral', 'ollama'],
    search: ['openai', 'anthropic', 'groq'],
    default: ['anthropic', 'openai', 'groq', 'mistral'],
  };
  return taskRoutes[task] || taskRoutes.default;
}

// ---------------------------------------------------------------------------
// Sleep helper for retry backoff
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main router function
// ---------------------------------------------------------------------------

/**
 * Call an LLM with automatic provider selection and fallback.
 *
 * @param {Object} options
 * @param {string} options.prompt - The user prompt
 * @param {string} [options.system] - System prompt
 * @param {Array}  [options.messages] - Full messages array (overrides prompt)
 * @param {string} [options.task='default'] - Task type: planning|coding|qa|search|default
 * @param {string} [options.provider] - Force a specific provider
 * @param {string} [options.model] - Force a specific model
 * @param {number} [options.maxTokens] - Max tokens (default: task-based)
 * @param {number} [options.retries=3] - Max retries per provider
 * @returns {Promise<string>} The LLM response text
 */
export async function callLLM({
  prompt,
  system,
  messages,
  task = 'default',
  provider: forcedProvider,
  model: forcedModel,
  maxTokens,
  retries = 3,
} = {}) {
  // Mock mode
  if (process.env.MOCK === 'true') {
    await sleep(100 + Math.random() * 200); // simulate latency
    return MOCK_RESPONSES[task] || MOCK_RESPONSES.default;
  }

  // Build messages array
  const msgArray = messages || [{ role: 'user', content: prompt || '' }];

  // Determine max tokens based on task
  const defaultMaxTokens = { planning: 4000, coding: 8000, qa: 2000, default: 4000 };
  const resolvedMaxTokens = maxTokens || defaultMaxTokens[task] || 4000;

  // Build provider order
  const providerOrder = forcedProvider ? [forcedProvider] : getProviderOrder(task);

  let lastError = null;

  for (const provName of providerOrder) {
    const cfg = PROVIDERS[provName];
    if (!cfg) continue;

    // Check if API key available (except Ollama)
    const apiKey = cfg.envKey ? process.env[cfg.envKey] : null;
    if (cfg.envKey && !apiKey) continue; // Skip if no key configured

    const model = forcedModel || cfg.defaultModels[task] || cfg.defaultModels.default;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        let result;

        if (provName === 'anthropic') {
          result = await callAnthropic(apiKey, model, msgArray, resolvedMaxTokens, system);
        } else {
          // Inject system prompt for OpenAI-compat providers
          let msgs = msgArray;
          if (system && !msgs.find((m) => m.role === 'system')) {
            msgs = [{ role: 'system', content: system }, ...msgArray];
          }
          result = await callOpenAICompat(
            provName,
            apiKey,
            cfg.baseUrl,
            model,
            msgs,
            resolvedMaxTokens
          );
        }

        // Record success for scoring
        providerScoring.recordSuccess(provName, task);
        return result;
      } catch (error) {
        lastError = error;

        // Rate limit: wait and retry
        if (error.message.includes('429') || error.message.includes('rate')) {
          const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          await sleep(backoff);
          continue;
        }

        // Auth error: skip this provider
        if (error.message.includes('401') || error.message.includes('403')) {
          providerScoring.recordFailure(provName, task);
          break;
        }

        // Other errors: retry with backoff
        if (attempt < retries - 1) {
          await sleep(1000 * (attempt + 1));
        }
      }
    }

    providerScoring.recordFailure(provName, task);
  }

  throw new Error(`All LLM providers failed. Last error: ${lastError?.message || 'unknown'}`);
}

/**
 * Get current usage statistics
 * @returns {Object} Usage stats including cost, tokens, calls by provider
 */
export function getUsageStats() {
  return { ...usageStats };
}

/**
 * Reset usage statistics
 */
export function resetUsageStats() {
  usageStats.totalInputTokens = 0;
  usageStats.totalOutputTokens = 0;
  usageStats.totalCostUSD = 0;
  usageStats.callCount = 0;
  usageStats.byProvider = {};
}

/**
 * List available providers (those with API keys configured or Ollama)
 * @returns {string[]}
 */
export function getAvailableProviders() {
  return Object.entries(PROVIDERS)
    .filter(([, cfg]) => !cfg.envKey || process.env[cfg.envKey])
    .map(([name]) => name);
}

export default { callLLM, getUsageStats, resetUsageStats, getAvailableProviders };
