const { getActiveProviders } = require('./providers');

const DEFAULTS = {
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3',
  },
  xai: {
    baseURL: 'https://api.x.ai/v1',
    model: process.env.XAI_MODEL || 'grok-3-mini',
  },
  mistral: {
    baseURL: 'https://api.mistral.ai/v1',
    model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
  },
};

/** Returns appropriate max_tokens per task type */
function maxTokens(taskType) {
  if (taskType === 'code' || taskType === 'fix') return 4096;
  if (taskType === 'planning') return 2048;
  if (taskType === 'qa') return 1024;
  return 2048;
}

async function tryOpenRouter(messages, modelHint, taskType) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OpenRouter API key missing');
  const model = modelHint || DEFAULTS.openrouter.model;
  const res = await fetch(`${DEFAULTS.openrouter.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens(taskType),
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function tryGroq(messages, modelHint, taskType) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Groq API key missing');
  const model = modelHint || DEFAULTS.groq.model;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens(taskType),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function tryOllama(messages, modelHint, taskType) {
  const model = modelHint || DEFAULTS.ollama.model;
  const res = await fetch(`${DEFAULTS.ollama.baseURL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { num_predict: maxTokens(taskType), temperature: 0.2 },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data?.message?.content || '';
}

async function tryOpenAI(messages, modelHint, taskType) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key missing');
  const model = modelHint || (process.env.OPENAI_MODEL || 'gpt-4o-mini');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens(taskType),
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function tryAnthropic(messages, modelHint, taskType) {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API key missing');
  const model = modelHint || (process.env.CLAUDE_MODEL || 'claude-sonnet-4-6');
  const system = messages.find(m => m.role === 'system')?.content || '';
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens(taskType),
      system,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).map(b => b.text || '').join('\n');
}

async function tryPerplexity(messages, modelHint, taskType) {
  const apiKey = process.env.PPLX_API_KEY || process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('Perplexity API key missing');
  const model = modelHint || (process.env.PPLX_MODEL || 'sonar-pro');
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens(taskType) }),
  });
  if (!res.ok) throw new Error(`Perplexity error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function tryGemini(messages, modelHint, taskType) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing');
  const model = modelHint || (process.env.GEMINI_MODEL || 'models/gemini-1.5-flash');
  const system = messages.find(m => m.role === 'system')?.content || '';
  const userContent = messages.filter(m => m.role === 'user').map(m => ({ text: m.content }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: userContent }],
        system_instruction: { role: 'system', parts: [{ text: system }] },
        generationConfig: { maxOutputTokens: maxTokens(taskType), temperature: 0.2 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.candidates || [])
    .map(c => (c.content?.parts || []).map(p => p.text || '').join('\n'))
    .join('\n');
}

async function tryDeepseek(messages, modelHint, taskType) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DeepSeek API key missing');
  const model = modelHint || (process.env.DEEPSEEK_MODEL || 'deepseek-coder');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens(taskType) }),
  });
  if (!res.ok) throw new Error(`DeepSeek error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function tryXAI(messages, modelHint, taskType) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('xAI API key missing');
  const model = modelHint || DEFAULTS.xai.model;
  const res = await fetch(`${DEFAULTS.xai.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens(taskType) }),
  });
  if (!res.ok) throw new Error(`xAI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function tryMistral(messages, modelHint, taskType) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('Mistral API key missing');
  const model = modelHint || DEFAULTS.mistral.model;
  const res = await fetch(`${DEFAULTS.mistral.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens(taskType),
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Mistral error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

const PROVIDER_FN_MAP = {
  groq: tryGroq,
  openai: tryOpenAI,
  openrouter: tryOpenRouter,
  claude: tryAnthropic,
  perplexity: tryPerplexity,
  gemini: tryGemini,
  deepseek: tryDeepseek,
  xai: tryXAI,
  mistral: tryMistral,
  ollama: tryOllama,
};

function providerOrder(taskType, preferred) {
  const baseline = ['xai', 'groq', 'openai', 'mistral', 'openrouter', 'claude', 'ollama', 'perplexity', 'gemini', 'deepseek'];
  const active = getActiveProviders();
  const preferredList = preferred ? [preferred] : [];
  return [...preferredList, ...baseline]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .filter(name => active.includes(name))
    .map(n => [n, PROVIDER_FN_MAP[n]])
    .filter(([, fn]) => !!fn);
}

async function retry(fn, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr || new Error('Retry failed');
}

async function chatCompletion({ messages, model: modelHint, taskType, preferredProvider }) {
  if (process.env.MOCK === 'true' || process.env.NODE_ENV === 'test') {
    if (taskType === 'planning') {
      return JSON.stringify({
        tasks: [
          { type: 'backend', description: 'build mock backend' },
          { type: 'ui', description: 'build mock ui' },
        ],
        requirements: [],
      });
    }
    if (taskType === 'qa') return JSON.stringify({ hasIssues: false, issues: [] });
    return JSON.stringify({
      files: [
        { path: 'backend/app/main.py', content: 'from fastapi import FastAPI\napp = FastAPI()\n# jwt bcrypt' },
        {
          path: 'backend/app/routes/auth.py',
          content:
            'from fastapi import APIRouter\nrouter = APIRouter()\n@router.post("/login")\ndef login(): pass\n@router.post("/register")\ndef reg(): pass\n@router.post("/refresh")\ndef ref(): pass\n@router.post("/reset")\ndef res(): pass\nclass users:\n  pass',
        },
        {
          path: 'frontend/src/app.jsx',
          content: "import React from 'react';\nexport default function App() { return <div>App</div>; }",
        },
      ],
    });
  }

  const envPreferred =
    process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== 'auto'
      ? process.env.LLM_PROVIDER
      : preferredProvider;

  let order = providerOrder(taskType, envPreferred);
  if (process.env.SAFE_MODE === 'true') {
    order = providerOrder(taskType, 'openai');
  }

  const names = order.map(([n]) => n);
  console.log(`LLM Router: task=${taskType} preferred=${envPreferred || 'auto'} order=${names.join(' > ')} maxTok=${maxTokens(taskType)}`);

  let lastError;
  for (const [name, fn] of order) {
    try {
      const content = await retry(() => fn(messages, modelHint, taskType), 3);
      if (typeof content === 'string' && content.length > 0) {
        return content;
      }
    } catch (err) {
      lastError = err;
      console.log(`LLM Router: [${name}] failed — ${err.message}. Trying next...`);
      continue;
    }
  }
  throw lastError || new Error('All LLM providers failed');
}

function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Empty LLM response');
  let text = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON object found in response (length: ${raw.length})`);
  text = text.slice(start, end + 1);
  // Strip non-printable control characters except tab/newline/CR
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object, got ' + typeof parsed);
  }
  return parsed;
}

module.exports = { chatCompletion, extractJSON };
