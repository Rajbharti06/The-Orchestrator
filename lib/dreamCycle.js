/**
 * dreamCycle.js - Background memory consolidation
 *
 * Runs "dream cycles" using cheaper models to reflect on build history,
 * extract patterns, update instincts, and journal insights.
 * Inspired by SwarmClaw's dream-model architecture.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { lessonStore } from './lessonStore.js';
import { instinctStore } from './instinctStore.js';
import { memoryStore } from './memoryStore.js';
import { callLLM } from './llmRouter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = join(__dirname, '..', 'memory');
const JOURNAL_PATH = join(MEMORY_DIR, 'dreams.jsonl');

let dreamTimer = null;

const DEFAULT_CONFIG = {
  dreamModel: 'claude-haiku-4-5-20251001',
  intervalMs: 2 * 60 * 60 * 1000, // 2 hours
  minEpisodes: 3,
  graduationThreshold: 0.82,
  pruneThreshold: 0.3,
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
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l))
      .slice(-limit);
  } catch { return []; }
}

/**
 * Run a single dream cycle.
 * Reflects on recent builds, extracts patterns, updates instincts.
 *
 * @returns {Promise<Object>} Cycle summary
 */
export async function runDreamCycle() {
  const history = memoryStore.getBuildHistory(20);
  if (history.length < config.minEpisodes) {
    return { skipped: true, reason: `Need ${config.minEpisodes} builds, have ${history.length}` };
  }

  const summary = {
    episodesProcessed: history.length,
    newLessons: 0,
    instinctsUpdated: 0,
    skillsGraduated: 0,
    pruned: 0,
    startedAt: new Date().toISOString(),
  };

  // Phase 1: Reflect on failures
  const failures = history.filter(b => b.outcome === 'failure' || b.qaScore < 60);
  if (failures.length > 0) {
    const reflectionPrompt = `You are analyzing AI build failures to extract lessons.

Recent failed/poor builds:
${failures.slice(0, 5).map(b => `- Stack: ${b.stack}, QA Score: ${b.qaScore}, Outcome: ${b.outcome}`).join('\n')}

Extract 2-3 specific, actionable lessons in this JSON format:
[
  {
    "issue": "What went wrong (specific)",
    "cause": "Root cause",
    "fix": "Exact fix to apply in future builds",
    "stack": "affected-stack or 'all'",
    "confidence": 0.0-1.0
  }
]

Return ONLY valid JSON array. No explanation.`;

    try {
      const raw = await callLLM({
        prompt: reflectionPrompt,
        model: config.dreamModel,
        task: 'default',
        maxTokens: 500,
      });

      const lessons = JSON.parse(raw.trim().replace(/```json\n?|\n?```/g, ''));
      if (Array.isArray(lessons)) {
        lessons.forEach(l => {
          if (l.issue && l.fix) {
            lessonStore.addLesson({ ...l, tags: ['dream', 'auto'] });
            summary.newLessons++;
          }
        });
      }
    } catch { /* reflection is non-critical */ }
  }

  // Phase 2: Reflect on successes — extract instincts
  const successes = history.filter(b => b.outcome === 'success' && b.qaScore >= 80);
  if (successes.length > 0) {
    const instinctPrompt = `Analyze these successful AI builds and extract 2-3 generalizable patterns.

Successful builds:
${successes.slice(0, 5).map(b => `- Stack: ${b.stack}, QA: ${b.qaScore}, Duration: ${Math.round((b.durationMs||0)/1000)}s`).join('\n')}

Extract patterns as JSON:
[
  {
    "pattern": "Short rule statement",
    "evidence": "What in the data supports this",
    "confidence": 0.5-0.9,
    "tags": ["tag1", "tag2"]
  }
]

Return ONLY valid JSON array.`;

    try {
      const raw = await callLLM({
        prompt: instinctPrompt,
        model: config.dreamModel,
        task: 'default',
        maxTokens: 400,
      });

      const instincts = JSON.parse(raw.trim().replace(/```json\n?|\n?```/g, ''));
      if (Array.isArray(instincts)) {
        instincts.forEach(inst => {
          if (inst.pattern) {
            instinctStore.addInstinct({
              pattern: inst.pattern,
              evidence: inst.evidence || '',
              confidence: inst.confidence || 0.6,
              tags: inst.tags || ['dream'],
            });
            summary.instinctsUpdated++;
          }
        });
      }
    } catch { /* non-critical */ }
  }

  // Phase 3: Prune expired/low-confidence instincts
  const pruned = instinctStore.pruneExpired(config.pruneThreshold);
  summary.pruned = pruned;

  // Phase 4: Graduate high-confidence instincts to skills
  const topInstincts = instinctStore.getTopInstincts(config.graduationThreshold);
  if (topInstincts.length >= 3) {
    const grouped = groupByDomain(topInstincts);
    for (const [domain, group] of Object.entries(grouped)) {
      if (group.length >= 3) {
        instinctStore.evolveToSkill(group.map(i => i.id), domain);
        summary.skillsGraduated++;
      }
    }
  }

  summary.completedAt = new Date().toISOString();
  summary.durationMs = new Date(summary.completedAt) - new Date(summary.startedAt);

  appendJournal({ type: 'dream-cycle', ...summary });

  return summary;
}

function groupByDomain(instincts) {
  const groups = {};
  instincts.forEach(inst => {
    const domain = (inst.tags || [])[0] || 'general';
    groups[domain] = groups[domain] || [];
    groups[domain].push(inst);
  });
  return groups;
}

/**
 * Start scheduled dream cycles.
 * @param {Object} [opts] - Override default config
 */
export function startDreamCycles(opts = {}) {
  config = { ...DEFAULT_CONFIG, ...opts };
  if (dreamTimer) clearInterval(dreamTimer);

  dreamTimer = setInterval(async () => {
    try {
      if (process.env.MOCK !== 'true') {
        await runDreamCycle();
      }
    } catch { /* dream cycles are non-critical */ }
  }, config.intervalMs);
}

/**
 * Stop dream cycles.
 */
export function stopDreamCycles() {
  if (dreamTimer) {
    clearInterval(dreamTimer);
    dreamTimer = null;
  }
}

/**
 * Get dream journal entries.
 * @param {number} limit
 * @returns {Array}
 */
export function getDreamJournal(limit = 20) {
  return getJournal(limit);
}

export default { runDreamCycle, startDreamCycles, stopDreamCycles, getDreamJournal };
