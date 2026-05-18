/**
 * llmRouter.js - Elite multi-provider LLM router
 *
 * Providers: Anthropic, Groq, DeepSeek, Gemini, Featherless, Ollama
 * Removed: xAI (grok-beta — not specialized for code), Mistral (outperformed),
 *          OpenRouter (redundant meta-layer adding latency/markup)
 *
 * Task types: planning | coding | qa | reasoning | security | longcontext | fast | default
 *
 * Primary coding model: Featherless → MiniMax-M2.5 (80.2% SWE-Bench Verified,
 * #1 open-source coding as of 2026, 1M context, RL-trained on 200k+ real envs)
 */

import fetch from 'node-fetch';
import { providerScoring } from './providerScoring.js';

// ---------------------------------------------------------------------------
// Mock responses
// ---------------------------------------------------------------------------
const MOCK_RESPONSES = {
  planning: `{"stack":{"backend":"express","frontend":"react","db":"sqlite"},"phases":[{"id":"plan","agent":"planner","deps":[]},{"id":"arch","agent":"architect","deps":["plan"]},{"id":"backend","agent":"backend","deps":["arch"],"parallel":true},{"id":"ui","agent":"ui","deps":["arch"],"parallel":true},{"id":"qa","agent":"qa","deps":["backend","ui"]},{"id":"fix","agent":"fix","deps":["qa"]},{"id":"run","agent":"run","deps":["fix"]},{"id":"test","agent":"apiTester","deps":["run"]}],"complexity":"medium","estimatedMinutes":5}`,
  coding: `// Generated code\nexport function main() {\n  console.log("Hello from Orchestrator X");\n}\nmain();`,
  reasoning: `{"analysis": "Step-by-step reasoning complete.", "conclusion": "Approach validated.", "confidence": 0.92}`,
  security: `{"threats": [], "score": 97, "owasp_violations": [], "recommendations": ["Enable HSTS", "Rotate secrets quarterly"]}`,
  qa: `{"passed":true,"issues":[],"score":95}`,
  longcontext: `Analysis complete. No architectural violations found.`,
  fast: `Task completed.`,
  default: `Task completed successfully.`,
};

// ---------------------------------------------------------------------------
// Provider configurations — only elite, battle-tested providers
// ---------------------------------------------------------------------------
const PROVIDERS = {
  anthropic: {
    name: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    envKey: 'ANTHROPIC_API_KEY',
    models: {
      planning:    'claude-opus-4-7',
      coding:      'claude-sonnet-4-6',
      qa:          'claude-haiku-4-5-20251001',
      reasoning:   'claude-opus-4-7',
      security:    'claude-sonnet-4-6',
      longcontext: 'claude-opus-4-7',
      fast:        'claude-haiku-4-5-20251001',
      default:     'claude-sonnet-4-6',
    },
    // Approximate pricing per 1k tokens
    costPer1kTokens: { input: 0.003, output: 0.015 },
    maxTokens: { planning: 8000, coding: 16000, qa: 4000, reasoning: 16000, security: 8000, longcontext: 32000, fast: 2000, default: 8000 },
    // Anthropic native API (different from OpenAI compat)
    nativeApi: true,
  },

  // Featherless: OpenAI-compatible, serverless access to elite open-source models
  // MiniMax-M2.5: 80.2% SWE-Bench Verified — #1 open-source coding model (2026)
  // DeepSeek-R1: 90% AIME — best open-source reasoning
  // Qwen3-235B: strong planning, 201 languages, 1M context
  featherless: {
    name: 'featherless',
    baseUrl: 'https://api.featherless.ai/v1',
    envKey: 'FEATHERLESS_API_KEY',
    models: {
      planning:    'Qwen/Qwen3-235B-A22B',
      coding:      'MiniMaxAI/MiniMax-M2.5',
      qa:          'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
      reasoning:   'deepseek-ai/DeepSeek-R1',
      security:    'MiniMaxAI/MiniMax-M2.5',
      longcontext: 'Qwen/Qwen3-235B-A22B',
      fast:        'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
      default:     'moonshot-ai/Kimi-K2-Instruct',
    },
    costPer1kTokens: { input: 0.0003, output: 0.0008 },
    maxTokens: { planning: 8000, coding: 16000, qa: 4000, reasoning: 16000, security: 8000, longcontext: 32000, fast: 2000, default: 8000 },
    nativeApi: false,
  },

  // Groq: ultra-fast inference (sub-200ms), ideal for rapid iteration and fast tasks
  groq: {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    models: {
      planning:    'llama-3.3-70b-versatile',
      coding:      'llama-3.3-70b-versatile',
      qa:          'llama3-groq-70b-8192-tool-use-preview',
      reasoning:   'llama-3.3-70b-versatile',
      security:    'llama-3.3-70b-versatile',
      longcontext: 'llama-3.3-70b-versatile',
      fast:        'llama3-8b-8192',
      default:     'llama-3.3-70b-versatile',
    },
    costPer1kTokens: { input: 0.00008, output: 0.00008 },
    maxTokens: { planning: 8192, coding: 8192, qa: 4096, reasoning: 8192, security: 8192, longcontext: 8192, fast: 4096, default: 8192 },
    nativeApi: false,
  },

  // DeepSeek: world-class reasoning (R1 = 90% AIME), V3 = top-tier coding
  deepseek: {
    name: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    models: {
      planning:    'deepseek-chat',
      coding:      'deepseek-chat',
      qa:          'deepseek-chat',
      reasoning:   'deepseek-reasoner',
      security:    'deepseek-chat',
      longcontext: 'deepseek-chat',
      fast:        'deepseek-chat',
      default:     'deepseek-chat',
    },
    costPer1kTokens: { input: 0.00014, output: 0.00028 },
    maxTokens: { planning: 8000, coding: 16000, qa: 4000, reasoning: 16000, security: 8000, longcontext: 16000, fast: 4000, default: 8000 },
    nativeApi: false,
  },

  // Gemini: 2M token context window — uniquely suited for entire codebase analysis
  gemini: {
    name: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GEMINI_API_KEY',
    models: {
      planning:    'gemini-2.5-pro',
      coding:      'gemini-2.5-flash',
      qa:          'gemini-2.5-flash',
      reasoning:   'gemini-2.5-pro',
      security:    'gemini-2.5-pro',
      longcontext: 'gemini-2.5-pro',
      fast:        'gemini-2.5-flash',
      default:     'gemini-2.5-flash',
    },
    costPer1kTokens: { input: 0.00025, output: 0.001 },
    maxTokens: { planning: 8000, coding: 16000, qa: 4000, reasoning: 32000, security: 8000, longcontext: 100000, fast: 4000, default: 8000 },
    nativeApi: false,
  },

  // Ollama: local/offline, zero cost, privacy-first
  ollama: {
    name: 'ollama',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    envKey: null,
    models: {
      planning:    'qwen2.5:72b',
      coding:      'qwen2.5-coder:32b',
      qa:          'qwen2.5:7b',
      reasoning:   'deepseek-r1:32b',
      security:    'qwen2.5-coder:32b',
      longcontext: 'qwen2.5:72b',
      fast:        'qwen2.5:7b',
      default:     'qwen2.5:32b',
    },
    costPer1kTokens: { input: 0, output: 0 },
    maxTokens: { planning: 8000, coding: 16000, qa: 4000, reasoning: 8000, security: 8000, longcontext: 16000, fast: 2000, default: 8000 },
    nativeApi: false,
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
// Anthropic native API
// ---------------------------------------------------------------------------
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
  recordUsage('anthropic', model, data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);
  return text;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible API (Groq, DeepSeek, Gemini, Featherless, Ollama)
// ---------------------------------------------------------------------------
async function callOpenAICompat(providerName, apiKey, baseUrl, model, messages, maxTokens) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;

  // Featherless-specific headers for routing
  if (providerName === 'featherless') {
    headers['x-title'] = 'Orchestrator-X';
  }

  const url = providerName === 'ollama'
    ? `${baseUrl}/api/chat/completions`
    : `${baseUrl}/chat/completions`;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.6 }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`${providerName} ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '';
  recordUsage(providerName, model, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0);
  return text;
}

// ---------------------------------------------------------------------------
// Provider routing — best-model-first per task
// ---------------------------------------------------------------------------

/**
 * Smart routing order per task type.
 * Built from 2026 benchmark analysis:
 * - coding:      Featherless MiniMax-M2.5 (#1 SWE-bench) → Anthropic → DeepSeek → Groq
 * - reasoning:   DeepSeek-R1 (90% AIME) → Featherless R1 → Anthropic Opus → Gemini 2.5 Pro
 * - security:    Anthropic → Featherless → DeepSeek → Gemini
 * - planning:    Anthropic Opus → Featherless Qwen3 → Gemini 2.5 Pro → DeepSeek
 * - longcontext: Gemini 2.5 Pro (2M ctx) → Featherless Qwen3 (1M ctx) → Anthropic
 * - fast:        Groq → Featherless (distilled) → Anthropic Haiku
 * - qa:          Groq → DeepSeek → Featherless → Anthropic Haiku
 */
function getProviderOrder(task) {
  const scored = providerScoring.getOrderedProviders(task);
  if (scored?.length > 0) return scored;

  const routes = {
    planning:    ['anthropic', 'featherless', 'gemini', 'deepseek', 'groq', 'ollama'],
    coding:      ['featherless', 'anthropic', 'deepseek', 'groq', 'gemini', 'ollama'],
    qa:          ['groq', 'deepseek', 'featherless', 'anthropic', 'ollama'],
    reasoning:   ['deepseek', 'featherless', 'anthropic', 'gemini', 'groq'],
    security:    ['anthropic', 'featherless', 'deepseek', 'gemini', 'groq'],
    longcontext: ['gemini', 'featherless', 'anthropic', 'deepseek'],
    fast:        ['groq', 'featherless', 'anthropic', 'deepseek'],
    default:     ['anthropic', 'featherless', 'deepseek', 'groq', 'gemini', 'ollama'],
  };
  return routes[task] || routes.default;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

/**
 * Call an LLM with automatic provider selection, smart routing, and fallback.
 *
 * @param {Object}  options
 * @param {string}  options.prompt - User prompt
 * @param {string}  [options.system] - System prompt
 * @param {Array}   [options.messages] - Full messages array (overrides prompt)
 * @param {string}  [options.task='default'] - planning|coding|qa|reasoning|security|longcontext|fast|default
 * @param {string}  [options.provider] - Force a specific provider
 * @param {string}  [options.model] - Force a specific model
 * @param {number}  [options.maxTokens] - Max tokens override
 * @param {number}  [options.retries=3] - Max retries per provider
 * @returns {Promise<string>} Response text
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
  if (process.env.MOCK === 'true') {
    await sleep(80 + Math.random() * 150);
    return MOCK_RESPONSES[task] || MOCK_RESPONSES.default;
  }

  const msgArray = messages || [{ role: 'user', content: prompt || '' }];
  const providerOrder = forcedProvider ? [forcedProvider] : getProviderOrder(task);

  let lastError = null;

  for (const provName of providerOrder) {
    const cfg = PROVIDERS[provName];
    if (!cfg) continue;

    const apiKey = cfg.envKey ? process.env[cfg.envKey] : null;
    if (cfg.envKey && !apiKey) continue;

    const model = forcedModel || cfg.models[task] || cfg.models.default;
    const resolvedMax = maxTokens || cfg.maxTokens[task] || cfg.maxTokens.default || 8000;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        let result;
        if (provName === 'anthropic') {
          result = await callAnthropic(apiKey, model, msgArray, resolvedMax, system);
        } else {
          let msgs = msgArray;
          if (system && !msgs.find((m) => m.role === 'system')) {
            msgs = [{ role: 'system', content: system }, ...msgArray];
          }
          result = await callOpenAICompat(provName, apiKey, cfg.baseUrl, model, msgs, resolvedMax);
        }

        providerScoring.recordSuccess(provName, task);
        return result;
      } catch (error) {
        lastError = error;

        if (error.message.includes('429') || error.message.includes('rate')) {
          await sleep(Math.pow(2, attempt) * 1000 + Math.random() * 500);
          continue;
        }

        if (error.message.includes('401') || error.message.includes('403')) {
          providerScoring.recordFailure(provName, task);
          break;
        }

        if (attempt < retries - 1) {
          await sleep(800 * (attempt + 1));
        }
      }
    }

    providerScoring.recordFailure(provName, task);
  }

  throw new Error(`All LLM providers failed. Last error: ${lastError?.message || 'unknown'}`);
}

export function getUsageStats() {
  return { ...usageStats };
}

export function resetUsageStats() {
  usageStats.totalInputTokens = 0;
  usageStats.totalOutputTokens = 0;
  usageStats.totalCostUSD = 0;
  usageStats.callCount = 0;
  usageStats.byProvider = {};
}

export function getAvailableProviders() {
  return Object.entries(PROVIDERS)
    .filter(([, cfg]) => !cfg.envKey || process.env[cfg.envKey])
    .map(([name, cfg]) => ({
      name,
      models: cfg.models,
      available: !cfg.envKey || !!process.env[cfg.envKey],
    }));
}

export default { callLLM, getUsageStats, resetUsageStats, getAvailableProviders };
