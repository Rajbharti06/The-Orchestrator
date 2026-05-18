/**
 * dreamCycle.js - Background memory consolidation + SICA self-improvement
 *
 * Research basis:
 * - SICA (Self-Improving Coding Agent, Univ. of Bristol): agent directly modifies
 *   its own prompt templates/strategies based on perf feedback — 17%→53% SWE-bench
 * - ProcMEM (arXiv:2602.01869): non-parametric procedural memory via PPO without
 *   weight updates — learns reusable strategies without catastrophic forgetting
 * - Dream-cycle memory consolidation: background pattern extraction every 2h
 *
 * Phases per cycle:
 *   1. Reflect on failures   → extract lessons
 *   2. Reflect on successes  → extract instincts (Bayesian confidence update)
 *   3. Prune expired entries → remove low-confidence, stale instincts
 *   4. Graduate instincts    → promote high-confidence to skills
 *   5. SICA self-improvement → agent edits its own prompt strategies (NEW)
 *   6. Procedural memory     → non-parametric skill distillation (NEW)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { lessonStore } from './lessonStore.js';
import { instinctStore } from './instinctStore.js';
import { memoryStore } from './memoryStore.js';
import { callLLM } from './llmRouter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR  = join(__dirname, '..', 'memory');
const JOURNAL_PATH     = join(MEMORY_DIR, 'dreams.jsonl');
const STRATEGIES_PATH  = join(MEMORY_DIR, 'strategies.json');
const PROCEDURES_PATH  = join(MEMORY_DIR, 'procedures.json');

let dreamTimer = null;

const DEFAULT_CONFIG = {
  intervalMs:            2 * 60 * 60 * 1000,
  minEpisodes:           3,
  graduationThreshold:   0.82,
  pruneThreshold:        0.25,
  sicaMinBuilds:         5,
  sicaImprovementTarget: 0.05,
};

let config = { ...DEFAULT_CONFIG };

function ensureMemoryDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function appendJournal(entry) {
  ensureMemoryDir();
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  try {
    const existing = existsSync(JOURNAL_PATH) ? readFileSync(JOURNAL_PATH, 'utf8') : '';
    writeFileSync(JOURNAL_PATH, existing + line + '\n');
  } catch { /* non-critical */ }
}

function getJournal(limit = 50) {
  if (!existsSync(JOURNAL_PATH)) return [];
  try {
    return readFileSync(JOURNAL_PATH, 'utf8')
      .trim().split('\n').filter(Boolean)
      .map(l => JSON.parse(l)).slice(-limit);
  } catch { return []; }
}

function loadStrategies() {
  try {
    if (existsSync(STRATEGIES_PATH)) return JSON.parse(readFileSync(STRATEGIES_PATH, 'utf8'));
  } catch {}
  return { planner: null, qa: null, fix: null, version: 0 };
}

function saveStrategies(strategies) {
  ensureMemoryDir();
  try { writeFileSync(STRATEGIES_PATH, JSON.stringify(strategies, null, 2)); } catch {}
}

function loadProcedures() {
  try {
    if (existsSync(PROCEDURES_PATH)) return JSON.parse(readFileSync(PROCEDURES_PATH, 'utf8'));
  } catch {}
  return [];
}

function saveProcedures(procs) {
  ensureMemoryDir();
  try { writeFileSync(PROCEDURES_PATH, JSON.stringify(procs, null, 2)); } catch {}
}

// ---------------------------------------------------------------------------
// Phase 5: SICA Self-Improvement
// Agent reviews its own performance and proposes prompt/strategy edits
// Based on: SICA (Bristol): agents modify own strategies → 17%→53% SWE-bench
// ---------------------------------------------------------------------------

async function sicaSelfImprove(history, summary) {
  const builds = history.filter(b => b.qaScore !== undefined);
  if (builds.length < config.sicaMinBuilds) {
    return { applied: false, reason: `Need ${config.sicaMinBuilds} builds, have ${builds.length}` };
  }

  const recentAvgQA = builds.slice(-5).reduce((s, b) => s + (b.qaScore || 0), 0) / Math.min(builds.length, 5);
  const allTimeAvgQA = builds.reduce((s, b) => s + (b.qaScore || 0), 0) / builds.length;

  // Identify recurring failure patterns
  const failures = builds.filter(b => b.outcome === 'failure' || b.qaScore < 60);
  const failuresByStack = {};
  failures.forEach(b => {
    const k = b.stack || 'unknown';
    failuresByStack[k] = (failuresByStack[k] || 0) + 1;
  });
  const topFailStack = Object.entries(failuresByStack).sort((a, b) => b[1] - a[1])[0];

  const strategies = loadStrategies();
  const currentStrategies = JSON.stringify(strategies, null, 2);

  const prompt = `You are a SICA (Self-Improving Coding Agent). Analyze your own performance data and propose strategy improvements.

Performance Metrics:
- Recent avg QA score (last 5 builds): ${recentAvgQA.toFixed(1)}/100
- All-time avg QA score: ${allTimeAvgQA.toFixed(1)}/100
- Total builds: ${builds.length}
- Most-failing stack: ${topFailStack ? `${topFailStack[0]} (${topFailStack[1]} failures)` : 'none'}

Current Strategies (your current behavioral configuration):
${currentStrategies}

Failures summary: ${failures.slice(0, 3).map(b => `${b.stack}: QA=${b.qaScore}`).join(', ')}

Propose SPECIFIC improvements to your strategies. Be surgical — only change what evidence supports.
Focus on: planning prompts, QA criteria, fix loop behavior, stack-specific handling.

Return JSON only:
{
  "proposedChanges": [
    {
      "agent": "planner"|"qa"|"fix"|"architect",
      "change": "Specific change to make to this agent's strategy",
      "reason": "Why this change is justified by the data",
      "expectedImprovement": 0.0-0.3
    }
  ],
  "overallAssessment": "One sentence on system health",
  "skipReason": null
}`;

  try {
    const raw = await callLLM({ task: 'reasoning', prompt, maxTokens: 800 });
    const parsed = JSON.parse(raw.trim().replace(/```json\n?|\n?```/g, '').match(/\{[\s\S]*\}/)?.[0] ?? '{}');

    if (!parsed.proposedChanges?.length || parsed.skipReason) {
      return { applied: false, reason: parsed.skipReason || 'No changes proposed' };
    }

    // Apply only changes with expected improvement > threshold
    const validChanges = parsed.proposedChanges.filter(c => c.expectedImprovement >= config.sicaImprovementTarget);

    if (validChanges.length === 0) {
      return { applied: false, reason: 'Proposed changes below improvement threshold' };
    }

    // Apply changes to strategy store
    validChanges.forEach(change => {
      if (!strategies[change.agent]) strategies[change.agent] = {};
      strategies[change.agent].lastUpdate = new Date().toISOString();
      strategies[change.agent].latestChange = change.change;
      strategies[change.agent].reasoning = change.reason;
    });

    strategies.version = (strategies.version || 0) + 1;
    strategies.lastSicaRun = new Date().toISOString();
    saveStrategies(strategies);

    summary.sicaChanges = validChanges.length;
    summary.sicaAssessment = parsed.overallAssessment;

    return { applied: true, changes: validChanges, version: strategies.version };
  } catch (err) {
    return { applied: false, reason: `SICA parse error: ${err.message.slice(0, 60)}` };
  }
}

// ---------------------------------------------------------------------------
// Phase 6: Procedural Memory (ProcMEM-inspired)
// Non-parametric skill distillation — no weight updates, no catastrophic forgetting
// ---------------------------------------------------------------------------

async function updateProceduralMemory(history) {
  const successes = history.filter(b => b.outcome === 'success' && b.qaScore >= 80);
  if (successes.length < 3) return { procedures: 0 };

  const procedures = loadProcedures();

  // Group successes by stack to extract stack-specific procedures
  const byStack = {};
  successes.forEach(b => {
    const k = b.stack || 'general';
    if (!byStack[k]) byStack[k] = [];
    byStack[k].push(b);
  });

  let newProcedures = 0;
  for (const [stack, builds] of Object.entries(byStack)) {
    if (builds.length < 2) continue;

    const prompt = `Extract a REUSABLE procedure (workflow pattern) from these successful builds.
A procedure is a step-by-step strategy that can be replayed in future similar builds.

Stack: ${stack}
Successful builds: ${builds.slice(0, 3).map(b => `QA=${b.qaScore}, duration=${Math.round((b.durationMs||0)/1000)}s`).join(' | ')}

Extract the core procedure that made these builds succeed.
Return JSON only:
{
  "name": "short-procedure-name",
  "trigger": "When to apply this procedure",
  "steps": ["step 1", "step 2", "step 3"],
  "expectedQA": 75-100,
  "stack": "${stack}"
}`;

    try {
      const raw = await callLLM({ task: 'reasoning', prompt, maxTokens: 400 });
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

      if (parsed.name && parsed.steps?.length) {
        // Non-parametric: store as retrievable object, not as weight updates
        const existing = procedures.findIndex(p => p.name === parsed.name && p.stack === stack);
        if (existing >= 0) {
          // Reinforce confidence on repeated extraction
          procedures[existing].confidence = Math.min(1, (procedures[existing].confidence || 0.5) + 0.1);
          procedures[existing].uses = (procedures[existing].uses || 0) + 1;
        } else {
          procedures.push({
            ...parsed,
            id:         `proc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            confidence: 0.6,
            uses:       1,
            created:    new Date().toISOString(),
          });
          newProcedures++;
        }
      }
    } catch { /* non-critical */ }
  }

  // Prune low-confidence procedures (< 0.3 and > 14 days old)
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const pruned = procedures.filter(p =>
    p.confidence >= 0.3 || new Date(p.created).getTime() > cutoff
  );

  saveProcedures(pruned);
  return { procedures: newProcedures, total: pruned.length };
}

// ---------------------------------------------------------------------------
// Main Dream Cycle
// ---------------------------------------------------------------------------

export async function runDreamCycle() {
  const history = memoryStore.getBuildHistory(20);
  if (history.length < config.minEpisodes) {
    return { skipped: true, reason: `Need ${config.minEpisodes} builds, have ${history.length}` };
  }

  const summary = {
    episodesProcessed: history.length,
    newLessons:        0,
    instinctsUpdated:  0,
    skillsGraduated:   0,
    pruned:            0,
    sicaChanges:       0,
    procedures:        0,
    startedAt:         new Date().toISOString(),
  };

  // Phase 1: Reflect on failures → extract lessons
  const failures = history.filter(b => b.outcome === 'failure' || b.qaScore < 60);
  if (failures.length > 0) {
    const reflectionPrompt = `Analyze AI build failures and extract lessons.

Failed builds (QA score / outcome):
${failures.slice(0, 5).map(b => `- Stack: ${b.stack}, QA: ${b.qaScore}, Outcome: ${b.outcome}`).join('\n')}

Extract 2-3 specific, actionable lessons. Return ONLY valid JSON array:
[
  {
    "issue": "What went wrong (specific, not generic)",
    "cause": "Root cause",
    "fix": "Exact fix to apply next time",
    "stack": "affected-stack or 'all'",
    "confidence": 0.6-0.9
  }
]`;

    try {
      const raw = await callLLM({ task: 'reasoning', prompt: reflectionPrompt, maxTokens: 600 });
      const lessons = JSON.parse(raw.trim().replace(/```json\n?|\n?```/g, ''));
      if (Array.isArray(lessons)) {
        lessons.forEach(l => {
          if (l.issue && l.fix) {
            lessonStore.addLesson({ ...l, tags: ['dream', 'auto'] });
            summary.newLessons++;
          }
        });
      }
    } catch { /* non-critical */ }
  }

  // Phase 2: Reflect on successes → extract instincts
  const successes = history.filter(b => b.outcome === 'success' && b.qaScore >= 80);
  if (successes.length > 0) {
    const instinctPrompt = `Analyze successful AI builds and extract generalizable patterns.

Successful builds:
${successes.slice(0, 5).map(b => `- Stack: ${b.stack}, QA: ${b.qaScore}, Duration: ${Math.round((b.durationMs||0)/1000)}s`).join('\n')}

Return ONLY valid JSON array:
[
  {
    "pattern": "Short rule statement (what to always do)",
    "evidence": "Data supporting this",
    "confidence": 0.5-0.85,
    "tags": ["tag1", "tag2"]
  }
]`;

    try {
      const raw = await callLLM({ task: 'reasoning', prompt: instinctPrompt, maxTokens: 500 });
      const instincts = JSON.parse(raw.trim().replace(/```json\n?|\n?```/g, ''));
      if (Array.isArray(instincts)) {
        instincts.forEach(inst => {
          if (inst.pattern) {
            instinctStore.addInstinct({
              pattern:    inst.pattern,
              evidence:   inst.evidence || '',
              confidence: inst.confidence || 0.6,
              tags:       inst.tags || ['dream'],
            });
            summary.instinctsUpdated++;
          }
        });
      }
    } catch { /* non-critical */ }
  }

  // Phase 3: Prune expired / low-confidence instincts
  const pruned = instinctStore.pruneExpired(config.pruneThreshold);
  summary.pruned = pruned?.pruned ?? 0;

  // Phase 4: Graduate high-confidence instincts to skills
  const skillCandidates = instinctStore.evolveToSkill();
  summary.skillsGraduated = skillCandidates?.length ?? 0;

  // Phase 5: SICA self-improvement (agent modifies its own strategies)
  try {
    const sicaResult = await sicaSelfImprove(history, summary);
    if (sicaResult.applied) {
      appendJournal({ type: 'sica-improvement', ...sicaResult });
    }
  } catch { /* non-critical */ }

  // Phase 6: Procedural memory update (non-parametric skill distillation)
  try {
    const procResult = await updateProceduralMemory(history);
    summary.procedures = procResult.procedures;
  } catch { /* non-critical */ }

  summary.completedAt = new Date().toISOString();
  summary.durationMs = new Date(summary.completedAt) - new Date(summary.startedAt);

  appendJournal({ type: 'dream-cycle', ...summary });
  return summary;
}

export function startDreamCycles(opts = {}) {
  config = { ...DEFAULT_CONFIG, ...opts };
  if (dreamTimer) clearInterval(dreamTimer);

  dreamTimer = setInterval(async () => {
    try {
      if (process.env.MOCK !== 'true') await runDreamCycle();
    } catch { /* non-critical */ }
  }, config.intervalMs);
}

export function stopDreamCycles() {
  if (dreamTimer) { clearInterval(dreamTimer); dreamTimer = null; }
}

export function getDreamJournal(limit = 20) {
  return getJournal(limit);
}

export function getStrategies() {
  return loadStrategies();
}

export function getProcedures() {
  return loadProcedures();
}

export default { runDreamCycle, startDreamCycles, stopDreamCycles, getDreamJournal, getStrategies, getProcedures };
