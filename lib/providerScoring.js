const PROVIDERS = {
  xai:        { speed: 9.0, cost: 8.0, reliability: 9.0 },
  groq:       { speed: 9.5, cost: 9.5, reliability: 7.0 },
  openai:     { speed: 7.0, cost: 5.0, reliability: 9.5 },
  mistral:    { speed: 8.0, cost: 7.5, reliability: 8.5 },
  openrouter: { speed: 8.0, cost: 8.0, reliability: 8.5 },
  claude:     { speed: 7.0, cost: 4.0, reliability: 9.5 },
  ollama:     { speed: 5.0, cost: 10,  reliability: 9.0 },
  perplexity: { speed: 7.5, cost: 6.0, reliability: 8.0 },
  gemini:     { speed: 7.5, cost: 7.0, reliability: 8.0 },
  deepseek:   { speed: 7.0, cost: 8.5, reliability: 7.5 },
};

const WEIGHTS = {
  planning: { speed: 0.4, reliability: 0.6 },
  code:     { speed: 0.5, reliability: 0.5 },
  fix:      { speed: 0.2, reliability: 0.8 },
  qa:       { speed: 0.1, reliability: 0.9 },
};

function scoreProvider(name, taskType) {
  const p = PROVIDERS[name];
  if (!p) return 0;
  const w = WEIGHTS[taskType] || { speed: 0.5, reliability: 0.5 };
  return (p.speed * (w.speed || 0)) + (p.reliability * (w.reliability || 0));
}

function selectProvider(taskType) {
  const envPreferred =
    process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== 'auto'
      ? process.env.LLM_PROVIDER
      : null;
  if (envPreferred && PROVIDERS[envPreferred]) return envPreferred;
  let best = 'groq';
  let bestScore = -Infinity;
  for (const name of Object.keys(PROVIDERS)) {
    const s = scoreProvider(name, taskType);
    if (s > bestScore) {
      bestScore = s;
      best = name;
    }
  }
  return best;
}

function computeAll(memorySummary) {
  return {
    planning: selectProvider('planning'),
    code:     selectProvider('code'),
    fix:      selectProvider('fix'),
    qa:       selectProvider('qa'),
  };
}

module.exports = { computeAll, scoreProvider };
