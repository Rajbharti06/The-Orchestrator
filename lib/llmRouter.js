const DEFAULTS = {
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  },
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3',
  },
};

async function tryOpenRouter(messages, modelHint) {
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
      max_tokens: 800,
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

async function tryGroq(messages, modelHint) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Groq API key missing');
  const model = modelHint || DEFAULTS.groq.model;
  const res = await fetch(`${DEFAULTS.groq.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 800
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function tryOllama(messages, modelHint) {
  const model = modelHint || DEFAULTS.ollama.model;
  // Convert messages into a single prompt for Ollama if needed
  const system = messages.find(m => m.role === 'system')?.content || '';
  const user = messages.find(m => m.role === 'user')?.content || '';
  const ollamaMessages = messages;
  // Use chat endpoint with stream: false
  const res = await fetch(`${DEFAULTS.ollama.baseURL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: ollamaMessages.length ? ollamaMessages : [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      stream: false,
      options: { num_predict: 800, temperature: 0.2 }
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data?.message?.content || '';
}

async function tryOpenAI(messages, modelHint) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key missing');
  const model = modelHint || (process.env.OPENAI_MODEL || 'gpt-4o-mini');
  const res = await fetch(`https://api.openai.com/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 800, response_format: { type: 'json_object' } })
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function tryAnthropic(messages, modelHint) {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API key missing');
  const model = modelHint || (process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229');
  // Convert OpenAI-style messages to Anthropic
  const system = messages.find(m => m.role === 'system')?.content || '';
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
  const res = await fetch(`https://api.anthropic.com/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: userText }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const contentBlocks = data.content || [];
  const text = contentBlocks.map(b => b.text || '').join('\n');
  return text;
}

async function tryPerplexity(messages, modelHint) {
  const apiKey = process.env.PPLX_API_KEY || process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('Perplexity API key missing');
  const model = modelHint || (process.env.PPLX_MODEL || 'pplx-70b-chat');
  const res = await fetch(`https://api.perplexity.ai/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 800 })
  });
  if (!res.ok) throw new Error(`Perplexity error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function tryGemini(messages, modelHint) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing');
  const model = modelHint || (process.env.GEMINI_MODEL || 'models/gemini-1.5-flash');
  // Convert messages to Gemini generateContent format
  const system = messages.find(m => m.role === 'system')?.content || '';
  const userContent = messages.filter(m => m.role === 'user').map(m => ({ text: m.content }));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: userContent }],
      system_instruction: { role: 'system', parts: [{ text: system }] }
    })
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const candidates = data.candidates || [];
  const text = candidates.map(c => (c.content?.parts || []).map(p => p.text || '').join('\n')).join('\n');
  return text;
}

async function tryDeepseek(messages, modelHint) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DeepSeek API key missing');
  const model = modelHint || (process.env.DEEPSEEK_MODEL || 'deepseek-coder');
  const res = await fetch(`https://api.deepseek.com/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 800 })
  });
  if (!res.ok) throw new Error(`DeepSeek error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

const { getActiveProviders } = require('./providers');

function providerOrder(taskType, preferred) {
  const adapters = {
    groq: tryGroq,
    openai: tryOpenAI,
    openrouter: tryOpenRouter,
    claude: tryAnthropic,
    perplexity: tryPerplexity,
    gemini: tryGemini,
    deepseek: tryDeepseek,
    ollama: tryOllama
  };
  const baseline = ['openai', 'groq', 'openrouter', 'ollama', 'claude', 'perplexity', 'gemini', 'deepseek'];
  const active = getActiveProviders();
  const preferredList = preferred ? [preferred] : [];
  const names = [...preferredList, ...baseline].filter((v, i, arr) => arr.indexOf(v) === i).filter(name => active.includes(name));
  return names.map(n => adapters[n]).filter(Boolean);
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
  if (process.env.MOCK === "true" || process.env.NODE_ENV === "test") {
    // Return a structured mock response based on taskType
    if (taskType === 'planning') {
      return JSON.stringify({
        tasks: [
          { type: 'backend', description: 'build mock backend' },
          { type: 'ui', description: 'build mock ui' }
        ],
        requirements: []
      });
    }
    if (taskType === 'qa') {
      return JSON.stringify({ hasIssues: false, issues: [] });
    }
    return JSON.stringify({
      files: [
        { path: 'backend/app/main.py', content: 'from fastapi import FastAPI\napp = FastAPI()\n# jwt bcrypt' },
        { path: 'backend/app/routes/auth.py', content: 'from fastapi import APIRouter\nrouter = APIRouter()\n@router.post("/login")\ndef login(): pass\n@router.post("/register")\ndef reg(): pass\n@router.post("/refresh")\ndef ref(): pass\n@router.post("/reset")\ndef res(): pass\nclass users:\n  pass' },
        { path: 'frontend/src/app.jsx', content: "import React from 'react';\nexport default function App() { return <div>StackForge</div>; }" }
      ]
    });
  }

  const envPreferred = process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== 'auto' ? process.env.LLM_PROVIDER : preferredProvider;
  let order = providerOrder(taskType, envPreferred);
  if (process.env.SAFE_MODE === "true") {
    // Force stable provider selection
    order = providerOrder(taskType, 'openai');
  }
  
  const providerDetails = order.map(fn => {
    if (fn === tryGroq) return 'groq';
    if (fn === tryOpenRouter) return 'openrouter';
    if (fn === tryOllama) return 'ollama';
    if (fn === tryOpenAI) return 'openai';
    if (fn === tryAnthropic) return 'claude';
    return 'unknown';
  });

  console.log(`LLM Router: taskType=${taskType} preferred=${envPreferred || 'auto'} order=${providerDetails.join(' > ')}`);
  
  let lastError;
  for (const fn of order) {
    try {
      const content = await retry(() => fn(messages, modelHint), 3);
      if (typeof content === 'string' && content.length > 0) {
        return content;
      }
    } catch (err) {
      lastError = err;
      console.log(`LLM Router: provider failed, trying next. Error=${err.message}`);
      continue;
    }
  }
  throw lastError || new Error('All LLM providers failed');
}

function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Empty response');
  let text = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found');
  text = text.slice(start, end + 1);
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  return JSON.parse(text);
}

module.exports = { chatCompletion, extractJSON };
