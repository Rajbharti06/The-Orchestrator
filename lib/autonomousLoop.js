/**
 * Autonomous Loop — Self-Improving Intelligence
 *
 * The orchestrator operates WITHOUT human input.
 * It monitors itself, finds weaknesses, and schedules improvement tasks.
 *
 * Cycle:
 *   1. Run eval suite → measure score
 *   2. Analyze failures → root causes
 *   3. Generate lessons from failures (write to lessonStore)
 *   4. Record success patterns (write to successLearner)
 *   5. Emit insights to SSE clients + console
 *   6. Sleep → repeat
 *
 * The loop does NOT rewrite its own source code (that's unsafe).
 * Instead it improves its MEMORY: lessons + success patterns.
 * On the next build, agents will receive better context and produce
 * better outputs. This is safe, grounded, and measurable.
 */

'use strict';

const fs           = require('fs');
const path         = require('path');
const { EventEmitter } = require('events');

const STATE_FILE     = path.join(process.cwd(), 'memory', 'autonomous_state.json');
const DEFAULT_MS     = 10 * 60 * 1000; // 10 minutes between cycles

const loopEmitter    = new EventEmitter();
let _timer           = null;
let _running         = false;
let _cycleCount      = 0;

// ── State persistence ─────────────────────────────────────────────────────────

function _loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {
    return { status: 'idle', cycles: 0, lastScore: null, lastCycleAt: null, improvements: [], insights: [] };
  }
}

function _saveState(s) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

function _broadcast(event, data) {
  loopEmitter.emit(event, data);
  try {
    require('./logsEmitter').emit('log', `[Auto] ${event}: ${JSON.stringify(data).slice(0, 120)}`);
  } catch {}
}

// ── Weakness analysis ─────────────────────────────────────────────────────────

async function _analyzeWeaknesses(evalResult) {
  const failedTests = (evalResult.tests || []).filter(t => !t.passed);
  if (!failedTests.length) return [];

  try {
    const { chatCompletion, extractJSON } = require('./llmRouter');
    const { loadLessons }                 = require('./lessonStore');
    const lessons = (loadLessons().lessons || []).slice(-5);

    const systemMsg = `
You are an AI that analyzes why a code-generation system is failing automated tests.
Given the failed tests and recent lessons from past errors, identify specific root causes.

Return ONLY JSON:
{
  "weaknesses": [
    {
      "area": "jwt-auth | file-structure | react-imports | api-contracts | sqlalchemy | etc",
      "description": "what specifically is wrong",
      "impact": "critical | high | medium",
      "prevention": "concrete instruction to add to future generation prompts",
      "testIds": ["affected_test_id"]
    }
  ],
  "rootCause": "the single most fundamental issue"
}
`.trim();

    const content = await chatCompletion({
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: `Failed: ${JSON.stringify(failedTests)}\nLessons: ${JSON.stringify(lessons)}` },
      ],
      taskType: 'qa',
    });
    return extractJSON(content)?.weaknesses || [];
  } catch {
    // Fallback: one weakness per failed test
    return failedTests.map(t => ({
      area: t.id,
      description: t.reason || 'Test failed',
      impact: 'high',
      prevention: `Fix code generation for "${t.name}" tests`,
      testIds: [t.id],
    }));
  }
}

// ── Improvement: write weaknesses as lessons ──────────────────────────────────

async function _writeWeaknessLessons(weaknesses, prompt = 'autonomous eval') {
  if (!weaknesses.length) return;
  try {
    const { recordLesson } = require('./lessonStore');
    const issues = weaknesses.map(w => ({
      description: w.description,
      severity:    w.impact || 'high',
      fix:         w.prevention,
    }));
    await recordLesson(prompt, issues, []);
  } catch {}
}

// ── Single Cycle ──────────────────────────────────────────────────────────────

async function runCycle() {
  const state = _loadState();
  _cycleCount = state.cycles + 1;

  console.log(`\n🤖 [Autonomous] Cycle ${_cycleCount} — ${new Date().toISOString()}`);
  _broadcast('cycle_start', { cycle: _cycleCount });

  state.status      = 'running';
  state.cycles      = _cycleCount;
  state.lastCycleAt = Date.now();
  _saveState(state);

  try {
    // ── 1. Eval ───────────────────────────────────────────────────────────────
    const { runEval, getTrend, getWeakAreas } = require('./evalEngine');
    const evalResult = await runEval({ mock: process.env.MOCK === 'true' });

    _broadcast('eval_complete', { score: evalResult.score, passed: evalResult.passed, total: evalResult.total });
    console.log(`   Score: ${evalResult.score}% (${evalResult.passed}/${evalResult.total})`);

    const prevScore = state.lastScore;
    state.lastScore = evalResult.score;

    // ── 2. Analyze weaknesses ─────────────────────────────────────────────────
    const weaknesses = evalResult.score < 100
      ? await _analyzeWeaknesses(evalResult)
      : [];

    // ── 3. Write weaknesses as lessons (memory improvement) ───────────────────
    if (weaknesses.length) {
      await _writeWeaknessLessons(weaknesses);
      _broadcast('lessons_written', { count: weaknesses.length, areas: weaknesses.map(w => w.area) });
      console.log(`   Lessons written: ${weaknesses.map(w => w.area).join(', ')}`);
    }

    // ── 4. Trend + insight ────────────────────────────────────────────────────
    const trendInfo = getTrend();
    const weakAreas = getWeakAreas();
    const insight = {
      cycle:     _cycleCount,
      score:     evalResult.score,
      trend:     trendInfo.trend,
      weakAreas: weakAreas.slice(0, 3).map(w => w.name),
      ts:        Date.now(),
    };
    state.insights = [insight, ...(state.insights || [])].slice(0, 20);

    // ── 5. Record improvement delta ───────────────────────────────────────────
    if (prevScore !== null && prevScore !== undefined && evalResult.score > prevScore) {
      const imp = { cycle: _cycleCount, from: prevScore, to: evalResult.score, delta: evalResult.score - prevScore, ts: Date.now() };
      state.improvements = [...(state.improvements || []), imp].slice(-20);
      _broadcast('improvement', imp);
      console.log(`   📈 Score improved: ${prevScore}% → ${evalResult.score}%`);
    }

    if (evalResult.score === 100) {
      console.log(`   🏆 Perfect score! All tests passing.`);
      _broadcast('perfect_score', { cycle: _cycleCount });
    }

    state.status = 'idle';
    _saveState(state);
    _broadcast('cycle_complete', insight);
    return insight;

  } catch (err) {
    console.error(`   ❌ Cycle error: ${err.message}`);
    state.status    = 'error';
    state.lastError = err.message;
    _saveState(state);
    _broadcast('cycle_error', { cycle: _cycleCount, error: err.message });
    throw err;
  }
}

// ── Loop Control ──────────────────────────────────────────────────────────────

/**
 * Start the autonomous loop.
 * Runs one cycle immediately, then every `intervalMs` milliseconds.
 */
function start(options = {}) {
  if (_running) return { alreadyRunning: true, cycle: _cycleCount };

  const intervalMs = options.intervalMs || DEFAULT_MS;
  _running = true;

  const state = _loadState();
  state.status    = 'running';
  state.startedAt = Date.now();
  _saveState(state);

  _broadcast('started', { intervalMs });
  console.log(`\n🤖 Autonomous Mode ACTIVATED — cycle every ${Math.round(intervalMs / 1000)}s\n`);

  // First cycle immediately (non-blocking)
  runCycle().catch(err => console.error('Cycle 1 error:', err.message));

  _timer = setInterval(() => {
    if (!_running) return;
    runCycle().catch(err => console.error(`Cycle error: ${err.message}`));
  }, intervalMs);

  return { started: true, intervalMs, cycle: _cycleCount };
}

/**
 * Stop the autonomous loop.
 */
function stop() {
  if (!_running) return { wasRunning: false };

  _running = false;
  if (_timer) { clearInterval(_timer); _timer = null; }

  const state = _loadState();
  state.status    = 'stopped';
  state.stoppedAt = Date.now();
  _saveState(state);

  _broadcast('stopped', { cycles: _cycleCount });
  console.log(`\n🛑 Autonomous Mode stopped after ${_cycleCount} cycle(s).\n`);

  return { stopped: true, cycles: _cycleCount };
}

function isRunning() { return _running; }

function getStatus() {
  return { running: _running, currentCycle: _cycleCount, ..._loadState() };
}

module.exports = { start, stop, runCycle, isRunning, getStatus, loopEmitter };
