const processEnv = process.env;

const providers = {
  groq: {
    apiKey: processEnv.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
    models: [processEnv.GROQ_MODEL || 'llama-3.3-70b-versatile'],
    enabled: !!processEnv.GROQ_API_KEY
  },
  openai: {
    apiKey: processEnv.OPENAI_API_KEY,
    baseURL: 'https://api.openai.com/v1',
    models: [processEnv.OPENAI_MODEL || 'gpt-4o-mini'],
    enabled: !!processEnv.OPENAI_API_KEY
  },
  openrouter: {
    apiKey: processEnv.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    models: [processEnv.OPENROUTER_MODEL || 'openai/gpt-4o-mini'],
    enabled: !!processEnv.OPENROUTER_API_KEY
  },
  claude: {
    apiKey: processEnv.CLAUDE_API_KEY || processEnv.ANTHROPIC_API_KEY,
    baseURL: 'https://api.anthropic.com/v1',
    models: [processEnv.CLAUDE_MODEL || 'claude-3-sonnet-20240229'],
    enabled: !!(processEnv.CLAUDE_API_KEY || processEnv.ANTHROPIC_API_KEY)
  },
  perplexity: {
    apiKey: processEnv.PPLX_API_KEY || processEnv.PERPLEXITY_API_KEY,
    baseURL: 'https://api.perplexity.ai',
    models: [processEnv.PPLX_MODEL || 'pplx-70b-chat'],
    enabled: !!(processEnv.PPLX_API_KEY || processEnv.PERPLEXITY_API_KEY)
  },
  gemini: {
    apiKey: processEnv.GEMINI_API_KEY || processEnv.GOOGLE_API_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    models: [processEnv.GEMINI_MODEL || 'models/gemini-1.5-flash'],
    enabled: !!(processEnv.GEMINI_API_KEY || processEnv.GOOGLE_API_KEY)
  },
  deepseek: {
    apiKey: processEnv.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com',
    models: [processEnv.DEEPSEEK_MODEL || 'deepseek-coder'],
    enabled: !!processEnv.DEEPSEEK_API_KEY
  },
  ollama: {
    apiKey: null,
    baseURL: processEnv.OLLAMA_BASE_URL || 'http://localhost:11434',
    models: [processEnv.OLLAMA_MODEL || 'llama3'],
    enabled: !!(processEnv.OLLAMA_BASE_URL || true) // local by default
  }
};

function registerProvider(name, config) {
  providers[name] = { ...config, enabled: true };
}

function getProvider(name) {
  return providers[name];
}

function getActiveProviders() {
  return Object.keys(providers).filter(p => providers[p].enabled && (providers[p].apiKey || p === 'ollama'));
}

module.exports = { providers, registerProvider, getProvider, getActiveProviders };

