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
      temperature: 0,
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
      temperature: 0,
      response_format: { type: 'json_object' },
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
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data?.message?.content || '';
}

async function chatCompletion({ messages, model: modelHint, taskType }) {
  const providers = [
    async () => tryGroq(messages, modelHint),
    async () => tryOpenRouter(messages, modelHint),
    async () => tryOllama(messages, modelHint),
  ];
  let lastError;
  for (const provider of providers) {
    try {
      const content = await provider();
      if (typeof content === 'string' && content.length > 0) {
        return content;
      }
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError || new Error('All LLM providers failed');
}

module.exports = { chatCompletion };
