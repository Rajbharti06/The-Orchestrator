/**
 * apiServer.js - REST API + WebSocket server
 *
 * Serves the dashboard, exposes all REST endpoints, and pushes real-time
 * logs via Server-Sent Events (SSE) and WebSocket.
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { jobQueue } from './jobQueue.js';
import { lessonStore } from './lessonStore.js';
import { instinctStore } from './instinctStore.js';
import { successLearner } from './successLearner.js';
import { evalEngine } from './evalEngine.js';
import { autonomousLoop } from './autonomousLoop.js';
import { skillLoader } from './skillLoader.js';
import { securityScanner } from './securityScanner.js';
import { qualityGate } from './qualityGate.js';
import { providerScoring } from './providerScoring.js';
import { memoryStore } from './memoryStore.js';
import { selfHeal } from './selfHeal.js';
import { getUsageStats } from './llmRouter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {Set<import('http').ServerResponse>} SSE clients */
const sseClients = new Set();
/** @type {Set<import('ws').WebSocket>} WS clients */
const wsClients = new Set();

/**
 * Broadcast a message to all connected clients.
 * @param {Object} data
 */
function broadcast(data) {
  const json = JSON.stringify(data);

  // SSE
  for (const client of sseClients) {
    try { client.write(`data: ${json}\n\n`); } catch { sseClients.delete(client); }
  }

  // WebSocket
  for (const ws of wsClients) {
    try {
      if (ws.readyState === 1) ws.send(json);
    } catch { wsClients.delete(ws); }
  }
}

/**
 * Start the REST API + WebSocket server.
 * @param {number} port
 * @param {import('events').EventEmitter} orchestratorEvents
 * @returns {Promise<import('http').Server>}
 */
export function startServer(port, orchestratorEvents) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Serve dashboard
  const publicDir = join(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // ── Real-time events ─────────────────────────────────────────────────────

  // Forward orchestrator events to all clients
  orchestratorEvents.on('log', (entry) => broadcast({ type: 'log', ...entry }));
  orchestratorEvents.on('completed', (data) => broadcast({ type: 'completed', ...data }));
  orchestratorEvents.on('failed', (data) => broadcast({ type: 'failed', ...data }));
  jobQueue.jobEvents.on('started', (job) => broadcast({ type: 'job_started', jobId: job.id, prompt: job.prompt }));
  jobQueue.jobEvents.on('completed', (job) => broadcast({ type: 'job_completed', jobId: job.id }));
  jobQueue.jobEvents.on('failed', (job) => broadcast({ type: 'job_failed', jobId: job.id, error: job.error }));

  // SSE endpoint for logs
  app.get('/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  // ── Build endpoints ──────────────────────────────────────────────────────

  app.post('/build', (req, res) => {
    const { prompt, stack, deploy: doDeploy, platform, priority } = req.body;
    if (!prompt?.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const job = jobQueue.enqueue(prompt.trim(), { stack, deploy: doDeploy, platform }, priority || 0);
    res.json({ jobId: job.id, status: 'queued', message: 'Build queued successfully' });
  });

  app.post('/cancel', (req, res) => {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    // Inject cancel into orchestrator via job state
    const { cancelBuild } = getOrchestratorFns();
    const cancelled = cancelBuild ? cancelBuild(jobId) : jobQueue.cancelJob(jobId);
    res.json({ cancelled });
  });

  app.get('/status', (req, res) => {
    const stats = jobQueue.getStats();
    const recent = jobQueue.getHistory(5);
    res.json({ ...stats, recent });
  });

  app.get('/history', (req, res) => {
    const limit = parseInt(req.query.limit || '20');
    res.json(memoryStore.getBuildHistory(limit));
  });

  // ── Queue endpoints ──────────────────────────────────────────────────────

  app.post('/queue', (req, res) => {
    const { prompt, options, priority } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const job = jobQueue.enqueue(prompt, options || {}, priority || 0);
    res.json(job);
  });

  app.get('/queue', (_req, res) => res.json(jobQueue.getQueue()));

  app.get('/queue/:id', (req, res) => {
    const job = jobQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  app.delete('/queue/:id', (req, res) => {
    const cancelled = jobQueue.cancelJob(req.params.id);
    res.json({ cancelled });
  });

  // ── Intelligence endpoints ───────────────────────────────────────────────

  app.get('/insights', (_req, res) => {
    const latest = evalEngine.getLatestResult();
    res.json({
      evalScore: latest?.score || null,
      trend: evalEngine.getTrend(),
      weakAreas: evalEngine.getWeakAreas(),
      lessonCount: lessonStore.getAllLessons().length,
      successCount: successLearner.getAllSuccesses().length,
      instinctCount: instinctStore.getAllInstincts(0).length,
      buildStats: memoryStore.getStats(),
      usage: getUsageStats(),
      providers: providerScoring.getAllScores(),
    });
  });

  app.get('/lessons', (_req, res) => res.json(lessonStore.getAllLessons()));
  app.post('/lessons', (req, res) => {
    const { issue, cause, fix, stack, tags } = req.body;
    if (!issue || !fix) return res.status(400).json({ error: 'issue and fix required' });
    res.json(lessonStore.addLesson({ issue, cause: cause || 'unknown', fix, stack, tags }));
  });
  app.delete('/lessons/:id', (req, res) => {
    const deleted = lessonStore.deleteLesson(req.params.id);
    res.json({ deleted });
  });

  app.get('/successes', (_req, res) => res.json(successLearner.getAllSuccesses()));

  // ── Instincts endpoints ──────────────────────────────────────────────────

  app.get('/instincts', (_req, res) => res.json(instinctStore.getAllInstincts(0)));
  app.post('/instincts/prune', (_req, res) => res.json(instinctStore.pruneExpired()));
  app.post('/instincts/evolve', (_req, res) => res.json(instinctStore.evolveToSkill()));

  // ── Evaluation endpoints ─────────────────────────────────────────────────

  app.post('/eval', async (_req, res) => {
    try {
      const result = await evalEngine.runEvalSuite();
      broadcast({ type: 'eval_complete', result });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/eval', (_req, res) => {
    res.json({
      latest: evalEngine.getLatestResult(),
      history: evalEngine.getScoreHistory().slice(0, 10),
      trend: evalEngine.getTrend(),
      weakAreas: evalEngine.getWeakAreas(),
      cases: evalEngine.getEvalCases(),
    });
  });

  // ── Autonomous loop ──────────────────────────────────────────────────────

  app.post('/autonomous/start', (req, res) => {
    const interval = parseInt(req.body?.intervalMs || '600000');
    autonomousLoop.startLoop(interval);
    broadcast({ type: 'autonomous_started' });
    res.json({ started: true, intervalMs: interval });
  });

  app.post('/autonomous/stop', (_req, res) => {
    autonomousLoop.stopLoop();
    broadcast({ type: 'autonomous_stopped' });
    res.json({ stopped: true });
  });

  app.get('/autonomous/status', (_req, res) => res.json(autonomousLoop.getStatus()));

  app.post('/autonomous/run-cycle', async (_req, res) => {
    try {
      const result = await autonomousLoop.runCycle();
      broadcast({ type: 'cycle_complete', result });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Skills endpoints ─────────────────────────────────────────────────────

  app.get('/skills', (_req, res) => res.json(skillLoader.getAllSkills()));
  app.get('/skills/:name', (req, res) => {
    const skill = skillLoader.getSkill(req.params.name);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    res.json(skill);
  });

  // ── Security + Quality endpoints ─────────────────────────────────────────

  app.post('/security-scan', (req, res) => {
    const { files } = req.body;
    if (!files) return res.status(400).json({ error: 'files required' });
    const result = securityScanner.scanFiles(files);
    res.json({ ...result, report: securityScanner.formatReport(result) });
  });

  app.post('/quality-gate', (req, res) => {
    const { files, contract } = req.body;
    if (!files) return res.status(400).json({ error: 'files required' });
    res.json(qualityGate.runQualityGate({ files, contract }));
  });

  // ── System endpoints ─────────────────────────────────────────────────────

  app.get('/providers', (_req, res) => res.json(providerScoring.getAllScores()));
  app.get('/health', async (_req, res) => res.json(selfHeal.getHealthStatus()));

  app.get('/strategy', async (req, res) => {
    const { prompt } = req.query;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    try {
      const strategy = await import('./strategyLayer.js').then((m) => m.decomposeGoal(prompt));
      res.json(strategy);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Task Board endpoints ─────────────────────────────────────────────────

  app.get('/tasks', async (_req, res) => {
    const { getTasks, getBoardStats } = await import('./taskBoard.js');
    res.json({ tasks: getTasks(), stats: getBoardStats() });
  });

  app.post('/tasks', async (req, res) => {
    const { addTask } = await import('./taskBoard.js');
    const task = addTask(req.body);
    res.json(task);
  });

  app.patch('/tasks/:id', async (req, res) => {
    const { updateTask } = await import('./taskBoard.js');
    const updated = updateTask(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    res.json(updated);
  });

  // ── Reports endpoints ────────────────────────────────────────────────────

  app.get('/reports', async (_req, res) => {
    const { listVersions, getLatestVersion } = await import('./reportStore.js');
    res.json({ versions: listVersions(), latest: getLatestVersion() });
  });

  app.get('/reports/:version', async (req, res) => {
    const { getReports } = await import('./reportStore.js');
    res.json(getReports(req.params.version));
  });

  // ── Dream Cycle endpoints ────────────────────────────────────────────────

  app.post('/dreams/run', async (_req, res) => {
    const { runDreamCycle } = await import('./dreamCycle.js');
    try {
      const result = await runDreamCycle();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/dreams/journal', async (req, res) => {
    const { getDreamJournal } = await import('./dreamCycle.js');
    const limit = parseInt(req.query.limit) || 20;
    res.json(getDreamJournal(limit));
  });

  // ── Engine endpoints ─────────────────────────────────────────────────────

  app.get('/engines', async (_req, res) => {
    const { listEngines } = await import('./multiEngine.js');
    res.json(listEngines());
  });

  // Catch-all: serve dashboard for SPA navigation
  app.get('*', (_req, res) => {
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.json({ service: 'Orchestrator X', version: '2.0.0', status: 'ok' });
    }
  });

  // ── HTTP + WebSocket server ──────────────────────────────────────────────

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ type: 'connected', message: 'Orchestrator X connected' }));
    ws.on('close', () => wsClients.delete(ws));
    ws.on('error', () => wsClients.delete(ws));
  });

  return new Promise((resolve, reject) => {
    server.listen(port, (err) => {
      if (err) return reject(err);
      resolve(server);
    });
  });
}

// Lazy reference to orchestrator functions (avoids circular dependency)
let orchestratorFns = {};
export function registerOrchestratorFns(fns) {
  orchestratorFns = fns;
}
function getOrchestratorFns() {
  return orchestratorFns;
}

export const apiServer = { startServer, broadcast, registerOrchestratorFns };
export default apiServer;
