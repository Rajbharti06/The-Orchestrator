/**
 * Success Learner — Learn from what WORKS
 *
 * Failure learning alone is one-sided. This module records the code patterns,
 * domain tags, and metrics from every successful build. On future runs both
 * "avoid these patterns" (lessons) and "replicate these patterns" (successes)
 * are injected into agent prompts — doubling the learning signal.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SUCCESS_FILE  = path.join(process.cwd(), 'memory', 'successes.json');
const MAX_SUCCESSES = 60;

const DOMAIN_KEYWORDS = [
  'auth', 'login', 'jwt', 'register', 'password',
  'database', 'sql', 'postgres', 'mysql', 'mongodb',
  'api', 'rest', 'graphql', 'websocket', 'realtime',
  'react', 'frontend', 'ui', 'form', 'component',
  'fastapi', 'django', 'express', 'backend',
  'crud', 'payment', 'stripe', 'deploy', 'chat',
  'dashboard', 'analytics', 'saas', 'multi-tenant',
];

// ── Storage ───────────────────────────────────────────────────────────────────

function load() {
  try { return JSON.parse(fs.readFileSync(SUCCESS_FILE, 'utf8')); } catch { return { successes: [] }; }
}

function save(data) {
  const dir = path.dirname(SUCCESS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (data.successes.length > MAX_SUCCESSES) data.successes = data.successes.slice(-MAX_SUCCESSES);
  fs.writeFileSync(SUCCESS_FILE, JSON.stringify(data, null, 2));
}

// ── Pattern Extraction ────────────────────────────────────────────────────────

function inferTags(prompt, files = []) {
  const p = (prompt || '').toLowerCase();
  const tags = DOMAIN_KEYWORDS.filter(k => p.includes(k));
  if (files.some(f => f.path?.endsWith('.py')))  tags.push('python');
  if (files.some(f => f.path?.endsWith('.jsx'))) tags.push('react');
  if (files.some(f => f.path?.includes('auth'))) tags.push('auth');
  return [...new Set(tags)];
}

function extractCodePatterns(files = []) {
  const patterns = [];
  const py  = files.filter(f => f.path?.endsWith('.py')).map(f => f.content || '').join('\n');
  const jsx = files.filter(f => f.path?.endsWith('.jsx')).map(f => f.content || '').join('\n');

  // Python / FastAPI
  if (/from fastapi import/.test(py))               patterns.push('fastapi-import');
  if (/app = FastAPI\(/.test(py))                   patterns.push('fastapi-init');
  if (/from pydantic import BaseModel/.test(py))    patterns.push('pydantic-models');
  if (/@(?:app|router)\.(get|post|put|delete)/.test(py)) patterns.push('fastapi-routes');
  if (/\bjwt\b|\bjose\b/i.test(py))                patterns.push('jwt-auth');
  if (/\bpasslib\b|\bbcrypt\b/i.test(py))          patterns.push('password-hashing');
  if (/\bSQLAlchemy\b|\bsqlalchemy\b/.test(py))    patterns.push('sqlalchemy-orm');
  if (/\bwebsocket\b/i.test(py))                   patterns.push('websocket');

  // React / JSX
  if (/from ['"]react['"]/.test(jsx))              patterns.push('react-import');
  if (/useState|useEffect/.test(jsx))              patterns.push('react-hooks');
  if (/fetch\(|axios\.(get|post)/.test(jsx))       patterns.push('api-calls');
  if (/tailwind|className=/.test(jsx))             patterns.push('tailwind-css');

  return patterns;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a successful build.
 * Called by orchestrator after a full successful run.
 */
async function recordSuccess(prompt, files = [], metrics = {}) {
  const data = load();
  const entry = {
    prompt:   prompt.substring(0, 140),
    tags:     inferTags(prompt, files),
    patterns: extractCodePatterns(files),
    metrics: {
      fileCount:        files.length,
      passedQA:         metrics.passedQA         ?? true,
      passedValidation: metrics.passedValidation ?? true,
      runSuccess:       metrics.runSuccess        ?? false,
      apiTestSuccess:   metrics.apiTestSuccess    ?? false,
      durationMs:       metrics.durationMs        ?? 0,
    },
    ts: Date.now(),
  };
  data.successes.push(entry);
  save(data);
  return entry;
}

/**
 * Retrieve success entries most relevant to the current prompt.
 */
function getSuccessPatterns(prompt, maxPatterns = 5) {
  const data = load();
  const p = (prompt || '').toLowerCase();
  return data.successes
    .map(s => {
      const tagHits  = (s.tags || []).filter(t => p.includes(t)).length;
      const bonusRun = s.metrics?.runSuccess      ? 2 : 0;
      const bonusApi = s.metrics?.apiTestSuccess  ? 2 : 0;
      return { s, score: tagHits + bonusRun + bonusApi };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPatterns)
    .map(x => x.s);
}

/**
 * Format success patterns as a prompt injection block.
 */
function formatSuccessesForPrompt(successes) {
  if (!successes?.length) return '';
  const lines = successes.slice(0, 3).map((s, i) => {
    const p = (s.patterns || []).join(', ') || 'none captured';
    return `${i + 1}. "${s.prompt}" → patterns used: [${p}]`;
  });
  return `\n✅ SUCCESSFUL BUILD PATTERNS — replicate these approaches:\n${lines.join('\n')}\n`;
}

function getStats() {
  const data = load();
  return {
    total:        data.successes.length,
    withApiTest:  data.successes.filter(s => s.metrics?.apiTestSuccess).length,
    withRunTest:  data.successes.filter(s => s.metrics?.runSuccess).length,
    topTags:      _topTags(data.successes),
  };
}

function _topTags(successes) {
  const counts = {};
  successes.forEach(s => (s.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}(${v})`);
}

module.exports = { recordSuccess, getSuccessPatterns, formatSuccessesForPrompt, getStats, load };
