const PROVIDERS = {
  groq: { speed: 9, cost: 9, reliability: 6 },
  openrouter: { speed: 7, cost: 7, reliability: 8 },
  ollama: { speed: 5, cost: 10, reliability: 9 }
};

const WEIGHTS = {
  planning: { speed: 0.4, reliability: 0.6 },
  code: { speed: 0.5, reliability: 0.5 },
  fix: { reliability: 0.8, speed: 0.2 },
  qa: { reliability: 0.9, speed: 0.1 }
};

function scoreProvider(name, taskType) {
  const p = PROVIDERS[name];
  const w = WEIGHTS[taskType] || { speed: 0.5, reliability: 0.5 };
  return (p.speed * (w.speed || 0)) + (p.reliability * (w.reliability || 0));
}

function selectProvider(taskType) {
  const envPreferred = process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== 'auto' ? process.env.LLM_PROVIDER : null;
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
    code: selectProvider('code'),
    fix: selectProvider('fix'),
    qa: selectProvider('qa')
  };
}

module.exports = { computeAll };
