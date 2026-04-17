/**
 * Strategy Layer — Long-Horizon Phased Planning
 *
 * Moves beyond flat task lists. Given a complex goal, this layer decomposes it
 * into ordered phases — each with its own objective, task list, and measurable
 * success criteria — before any code is written.
 *
 * Flow:
 *   1. Receive high-level goal
 *   2. Decompose into phases (foundation → logic → integration → verify → ship)
 *   3. Each phase has tasks[] and success_criteria[]
 *   4. Phase state tracked: pending → running → done | failed | skipped
 *   5. Strategy persisted to disk so progress survives restarts
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { chatCompletion, extractJSON } = require('./llmRouter');

const STRATEGY_FILE = path.join(process.cwd(), 'memory', 'strategy.json');

// ── Persistence ───────────────────────────────────────────────────────────────

function loadStrategy() {
  try { return JSON.parse(fs.readFileSync(STRATEGY_FILE, 'utf8')); } catch { return null; }
}

function saveStrategy(strategy) {
  const dir = path.dirname(STRATEGY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STRATEGY_FILE, JSON.stringify(strategy, null, 2));
}

// ── Goal Decomposition ────────────────────────────────────────────────────────

/**
 * Decompose a complex goal into ordered phases with measurable success criteria.
 * Falls back to a sane 3-phase default if the LLM fails.
 */
async function decomposeGoal(prompt, stack = {}) {
  const systemMsg = `
You are a strategic engineering planner.
Your ONLY job is to design a MULTI-PHASE EXECUTION STRATEGY for building software.
Do NOT write any code. Think like a tech lead planning a sprint.

Phases (use as many as needed, usually 3-5):
  Phase 1 — Foundation:      core data models, entry points, config
  Phase 2 — Business Logic:  feature implementation, auth, domain rules
  Phase 3 — Integration:     wire frontend↔backend, shared contracts
  Phase 4 — Verification:    automated tests, API validation
  Phase 5 — Delivery:        deploy, docs, final polish

Return ONLY valid JSON:
{
  "goal": "one sentence – what we are building",
  "complexity": "simple | medium | complex",
  "phases": [
    {
      "id": "phase_1",
      "name": "Foundation",
      "objective": "what this phase achieves",
      "tasks": ["Create backend entry point", "Set up DB models"],
      "success_criteria": ["backend starts cleanly", "models defined"],
      "depends_on": [],
      "skip_if": null
    }
  ],
  "risk_factors": ["potential blocker 1", "potential blocker 2"],
  "estimated_complexity": { "files": 5, "backend_routes": 4, "frontend_components": 3 }
}
`.trim();

  try {
    const content = await chatCompletion({
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: `Goal: "${prompt}"\nStack: ${JSON.stringify(stack)}` },
      ],
      taskType: 'planning',
    });
    const spec = extractJSON(content);
    if (!spec || !Array.isArray(spec.phases) || !spec.phases.length) throw new Error('Invalid spec');
    return _annotate(spec, prompt);
  } catch {
    return _annotate(_fallbackStrategy(prompt), prompt);
  }
}

function _annotate(spec, prompt) {
  spec.phases = spec.phases.map(p => ({
    ...p,
    status: 'pending',    // pending | running | done | failed | skipped
    startedAt: null,
    completedAt: null,
    outcome: null,
  }));
  spec.prompt     = prompt;
  spec.createdAt  = Date.now();
  spec.status     = 'active';
  saveStrategy(spec);
  return spec;
}

function _fallbackStrategy(prompt) {
  return {
    goal: prompt.substring(0, 100),
    complexity: 'medium',
    phases: [
      { id: 'phase_1', name: 'Core Structure',      objective: 'Backend entry point + data models',    tasks: ['Create backend entry point', 'Set up database models'],  success_criteria: ['backend starts', 'models defined'],          depends_on: [], skip_if: null },
      { id: 'phase_2', name: 'Business Logic',       objective: 'Implement API routes + domain rules',  tasks: ['Create API routes', 'Implement business logic'],          success_criteria: ['all endpoints respond', 'rules enforced'],   depends_on: ['phase_1'], skip_if: null },
      { id: 'phase_3', name: 'Frontend & Integration', objective: 'Build UI + wire API calls',          tasks: ['Create React components', 'Wire up API calls'],           success_criteria: ['UI renders', 'API calls succeed'],           depends_on: ['phase_2'], skip_if: null },
    ],
    risk_factors: [],
    estimated_complexity: { files: 4, backend_routes: 3, frontend_components: 2 },
    _fallback: true,
  };
}

// ── Phase State Machine ───────────────────────────────────────────────────────

function startPhase(phaseId) {
  const s = loadStrategy();
  if (!s) return null;
  const p = s.phases.find(x => x.id === phaseId);
  if (!p) return null;
  p.status    = 'running';
  p.startedAt = Date.now();
  saveStrategy(s);
  return s;
}

function completePhase(phaseId, outcome = { success: true }) {
  const s = loadStrategy();
  if (!s) return null;
  const p = s.phases.find(x => x.id === phaseId);
  if (!p) return null;
  p.status      = outcome.success ? 'done' : 'failed';
  p.completedAt = Date.now();
  p.outcome     = outcome;
  // If all done, mark strategy complete
  if (s.phases.every(x => x.status === 'done' || x.status === 'skipped')) {
    s.status = 'complete';
  }
  saveStrategy(s);
  return s;
}

function getActivePhase() {
  const s = loadStrategy();
  if (!s) return null;
  return s.phases.find(p => p.status === 'pending' || p.status === 'running') || null;
}

// ── Prompt Injection ──────────────────────────────────────────────────────────

function formatStrategyForPrompt(strategy) {
  if (!strategy) return '';
  const lines = [`\n🎯 EXECUTION STRATEGY: "${strategy.goal}"`];
  strategy.phases.forEach((p, i) => {
    const icon = { done: '✅', failed: '❌', running: '🔄', skipped: '⏭️', pending: '⏳' }[p.status] || '⏳';
    lines.push(`${icon} Phase ${i + 1} [${p.name}] — ${p.objective}`);
    if (p.status === 'pending' || p.status === 'running') {
      lines.push(`   Tasks:   ${p.tasks.join(' | ')}`);
      lines.push(`   Success: ${p.success_criteria.join(' | ')}`);
    }
  });
  if (strategy.risk_factors?.length) {
    lines.push(`\n⚠️  Risks: ${strategy.risk_factors.join(', ')}`);
  }
  return lines.join('\n') + '\n';
}

// ── Complexity Detection ──────────────────────────────────────────────────────

/**
 * Decide whether a prompt is "complex" enough to warrant phased planning.
 * Keeps simple prompts fast (no extra LLM call).
 */
function isComplexPrompt(prompt) {
  const p = (prompt || '').toLowerCase();
  if (p.length > 100) return true;
  if (/(and|with|plus|also|then|including|plus)\s+\w+/.test(p)) return true;
  const featureKeywords = ['auth', 'login', 'jwt', 'deploy', 'database', 'payment', 'real.?time', 'chat', 'dashboard'];
  const hits = featureKeywords.filter(k => new RegExp(k).test(p));
  return hits.length >= 2;
}

module.exports = {
  decomposeGoal,
  startPhase,
  completePhase,
  getActivePhase,
  loadStrategy,
  saveStrategy,
  formatStrategyForPrompt,
  isComplexPrompt,
};
