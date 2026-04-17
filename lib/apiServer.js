const express = require('express');
const path = require('path');
const cors = require('cors');
const emitter = require('./logsEmitter');
// generateCode is required lazily inside the /build handler to avoid circular imports

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// ── Build state ───────────────────────────────────────────────────────────────
let buildState = {
  status: 'idle',       // idle | running | done | failed | cancelled
  prompt: null,
  startedAt: null,
  finishedAt: null,
  phase: 'idle',        // idle | planning | backend | ui | qa | fix | test | deploy
  progress: 0,          // 0–100
  error: null,
  files: [],
};
let buildHistory = [];
let cancelRequested = false;
let sseClients = [];

const PHASE_PROGRESS = {
  idle: 0, planning: 10, backend: 30, ui: 50, qa: 60, fix: 70, test: 80, deploy: 90, done: 100,
};

function updatePhase(phase) {
  buildState.phase = phase;
  buildState.progress = PHASE_PROGRESS[phase] || buildState.progress;
  broadcast({ type: 'phase', phase, progress: buildState.progress });
}

function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.res.write(payload); } catch (_) {}
  }
}

// Wire emitter events to SSE broadcast
emitter.on('log', msg => broadcast({ type: 'log', msg }));
emitter.on('phase', phase => updatePhase(phase));
emitter.on('react', event => broadcast({ type: 'react', event }));

// ── SSE log stream ────────────────────────────────────────────────────────────
app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { res };
  sseClients.push(client);

  // Send current state on connect
  res.write(`data: ${JSON.stringify({ type: 'state', state: buildState })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== client);
  });
});

// ── Start build ───────────────────────────────────────────────────────────────
app.post('/build', async (req, res) => {
  if (buildState.status === 'running') {
    return res.status(409).json({ error: 'A build is already running. Cancel it first.' });
  }

  const { prompt, llm, hosting, stack } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  cancelRequested = false;
  buildState = {
    status: 'running',
    prompt,
    startedAt: Date.now(),
    finishedAt: null,
    phase: 'planning',
    progress: 5,
    error: null,
    files: [],
  };

  process.env.LLM_PROVIDER = llm || process.env.LLM_PROVIDER || 'auto';
  process.env.HOSTING = hosting || process.env.HOSTING || 'auto';
  if (stack) {
    const parts = stack.split('+');
    if (parts[0]) process.env.STACK_BACKEND = parts[0].trim();
    if (parts[1]) process.env.STACK_FRONTEND = parts[1].trim();
    if (parts[2]) process.env.STACK_DB = parts[2].trim();
  }

  res.status(202).json({ message: 'Build started', buildId: buildState.startedAt });
  broadcast({ type: 'state', state: buildState });

  try {
    const { generateCode } = require('../orchestrator');
    const files = await generateCode(prompt);
    if (cancelRequested) {
      buildState.status = 'cancelled';
      buildState.phase = 'idle';
    } else {
      buildState.status = 'done';
      buildState.phase = 'done';
      buildState.progress = 100;
      buildState.files = (files || []).map(f => f.path);
    }
  } catch (err) {
    buildState.status = 'failed';
    buildState.error = err.message;
    emitter.emit('log', `Build failed: ${err.message}`);
  } finally {
    buildState.finishedAt = Date.now();
    buildHistory.unshift({ ...buildState });
    if (buildHistory.length > 20) buildHistory.pop();
    broadcast({ type: 'state', state: buildState });
  }
});

// ── Cancel running build ──────────────────────────────────────────────────────
app.post('/cancel', (req, res) => {
  if (buildState.status !== 'running') {
    return res.status(400).json({ error: 'No build is currently running.' });
  }
  cancelRequested = true;
  buildState.status = 'cancelled';
  emitter.emit('log', 'Build cancelled by user.');
  broadcast({ type: 'state', state: buildState });
  res.json({ message: 'Cancellation requested.' });
});

// ── Status ────────────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json(buildState);
});

// ── History ───────────────────────────────────────────────────────────────────
app.get('/history', (req, res) => {
  res.json(buildHistory);
});

// ── Provider list ─────────────────────────────────────────────────────────────
app.get('/providers', (req, res) => {
  const { getActiveProviders } = require('./providers');
  res.json({ active: getActiveProviders() });
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const { getAllStates } = require('./selfHeal');
  res.json({ ok: true, version: '2.0', subsystems: getAllStates() });
});

// ── Job Queue endpoints ───────────────────────────────────────────────────────
app.post('/queue', (req, res) => {
  const { prompt, options } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  const { createJob } = require('./jobQueue');
  const job = createJob(prompt, options || {});
  res.status(202).json({ jobId: job.id, status: job.status });
});

app.get('/queue', (req, res) => {
  const { getAllJobs, getQueueStatus } = require('./jobQueue');
  res.json({ status: getQueueStatus(), jobs: getAllJobs() });
});

app.get('/queue/:id', (req, res) => {
  const { getJob } = require('./jobQueue');
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.delete('/queue/:id', (req, res) => {
  const { cancelJob } = require('./jobQueue');
  const ok = cancelJob(req.params.id);
  if (!ok) return res.status(400).json({ error: 'Cannot cancel job (not found or already finished)' });
  res.json({ cancelled: true });
});

// ── Lessons ───────────────────────────────────────────────────────────────────
app.get('/lessons', (req, res) => {
  const { loadLessons } = require('./lessonStore');
  res.json(loadLessons());
});

// ── Successes ─────────────────────────────────────────────────────────────────
app.get('/successes', (req, res) => {
  const { load, getStats } = require('./successLearner');
  res.json({ stats: getStats(), ...load() });
});

// ── Eval ──────────────────────────────────────────────────────────────────────
app.post('/eval', async (req, res) => {
  const { testIds, mock } = req.body || {};
  res.status(202).json({ message: 'Eval started. Watch /logs for progress.' });
  try {
    const { runEval } = require('./evalEngine');
    const result = await runEval({ testIds, mock });
    broadcast({ type: 'eval_complete', result });
  } catch (err) {
    broadcast({ type: 'eval_error', error: err.message });
  }
});

app.get('/eval', (req, res) => {
  const { getEvalHistory, getTrend, getWeakAreas } = require('./evalEngine');
  const data = getEvalHistory();
  res.json({ ...data, trend: getTrend(), weakAreas: getWeakAreas() });
});

// ── Strategy ──────────────────────────────────────────────────────────────────
app.get('/strategy', (req, res) => {
  const { loadStrategy } = require('./strategyLayer');
  const strategy = loadStrategy();
  res.json(strategy || { status: 'none' });
});

// ── Autonomous Loop ───────────────────────────────────────────────────────────
app.post('/autonomous/start', (req, res) => {
  const { intervalMs } = req.body || {};
  const loop = require('./autonomousLoop');
  const result = loop.start({ intervalMs: intervalMs || undefined });
  // Wire loop events to SSE
  loop.loopEmitter.on('cycle_complete', data => broadcast({ type: 'autonomous', event: 'cycle_complete', data }));
  loop.loopEmitter.on('improvement',   data => broadcast({ type: 'autonomous', event: 'improvement', data }));
  loop.loopEmitter.on('perfect_score', data => broadcast({ type: 'autonomous', event: 'perfect_score', data }));
  res.json(result);
});

app.post('/autonomous/stop', (req, res) => {
  const loop = require('./autonomousLoop');
  res.json(loop.stop());
});

app.get('/autonomous/status', (req, res) => {
  const loop = require('./autonomousLoop');
  res.json(loop.getStatus());
});

app.post('/autonomous/run-cycle', async (req, res) => {
  const loop = require('./autonomousLoop');
  res.status(202).json({ message: 'Cycle started. Watch /logs.' });
  loop.runCycle().catch(err => broadcast({ type: 'autonomous', event: 'error', data: err.message }));
});

// ── Insights ──────────────────────────────────────────────────────────────────
app.get('/insights', (req, res) => {
  const { getTrend, getWeakAreas, getEvalHistory } = require('./evalEngine');
  const { getStats: successStats }                 = require('./successLearner');
  const { loadLessons }                            = require('./lessonStore');
  const loop                                       = require('./autonomousLoop');

  const evalData = getEvalHistory();
  const lessons  = loadLessons();

  res.json({
    eval: {
      latest:    evalData.lastRun,
      trend:     getTrend(),
      weakAreas: getWeakAreas(),
    },
    learning: {
      lessons:    lessons.lessons?.length || 0,
      successes:  successStats(),
    },
    autonomous: loop.getStatus(),
    buildHistory: {
      total:   buildHistory.length,
      recent:  buildHistory.slice(0, 5).map(b => ({ prompt: b.prompt?.slice(0, 60), status: b.status, duration: b.finishedAt - b.startedAt })),
    },
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () =>
  console.log(`The Orchestrator ready → http://localhost:${PORT}`)
);

module.exports = { app };
