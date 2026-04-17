/**
 * Eval Engine — Self-Scoring Capability
 *
 * The orchestrator tests ITSELF against a fixed suite of known tasks.
 * No human needed to measure quality.
 *
 * How it works:
 *   1. Fixed test suite: prompt → expected code patterns
 *   2. Run each test through the full pipeline (or mock)
 *   3. Score result against expected patterns
 *   4. Track score history → detect regressions & improvements
 *
 * Score = passed / total × 100 (%)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const EVAL_FILE   = path.join(process.cwd(), 'memory', 'eval_results.json');
const MAX_HISTORY = 30;

// ── Test Suite ────────────────────────────────────────────────────────────────

const TEST_SUITE = [
  {
    id: 'hello_api',
    name: 'Hello World API',
    prompt: 'Create a FastAPI hello world with a /hello endpoint that returns {"message": "Hello World"}',
    score: (files) => {
      const py = _pyContent(files);
      const hasRoute   = /\/hello/.test(py);
      const hasFastAPI = /FastAPI/.test(py);
      const hasReturn  = /Hello World/.test(py);
      const passed = hasFastAPI && hasRoute && hasReturn;
      return { passed, details: { hasFastAPI, hasRoute, hasReturn } };
    },
    minFiles: 1,
  },
  {
    id: 'auth_jwt',
    name: 'JWT Auth System',
    prompt: 'Build a FastAPI authentication system with JWT login and register endpoints',
    score: (files) => {
      const py = _pyContent(files);
      const hasLogin    = /\/login/.test(py);
      const hasRegister = /\/register/.test(py);
      const hasJwt      = /\bjwt\b|\bjose\b|\bpyjwt\b/i.test(py);
      const hasFastAPI  = /FastAPI/.test(py);
      const passed = hasFastAPI && hasLogin && hasJwt;
      return { passed, details: { hasFastAPI, hasLogin, hasRegister, hasJwt } };
    },
    minFiles: 2,
  },
  {
    id: 'react_login',
    name: 'React Login Form',
    prompt: 'Create a React login form component with email and password fields that calls /api/login',
    score: (files) => {
      const jsx = _jsxContent(files);
      const hasReact    = /from ['"]react['"]|import React/.test(jsx);
      const hasLogin    = /login/.test(jsx);
      const hasPassword = /password/.test(jsx);
      const passed = hasReact && hasLogin && hasPassword;
      return { passed, details: { hasReact, hasLogin, hasPassword } };
    },
    minFiles: 1,
  },
  {
    id: 'crud_api',
    name: 'CRUD REST API',
    prompt: 'Build a FastAPI CRUD API for managing tasks with SQLAlchemy and PostgreSQL',
    score: (files) => {
      const py = _pyContent(files);
      const hasFastAPI   = /FastAPI/.test(py);
      const hasRoutes    = /@(?:app|router)\.(get|post|put|delete|patch)/.test(py);
      const hasSQLAlchemy = /sqlalchemy|SQLAlchemy/.test(py);
      const passed = hasFastAPI && hasRoutes && hasSQLAlchemy;
      return { passed, details: { hasFastAPI, hasRoutes, hasSQLAlchemy } };
    },
    minFiles: 2,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function _pyContent(files)  { return (files || []).filter(f => f.path?.endsWith('.py')).map(f => f.content || '').join('\n'); }
function _jsxContent(files) { return (files || []).filter(f => f.path?.endsWith('.jsx') || f.path?.endsWith('.js')).map(f => f.content || '').join('\n'); }

// ── Mock file generation ──────────────────────────────────────────────────────
// Used when MOCK=true to verify the scoring logic itself without LLM calls

function _mockFiles(test) {
  const mocks = {
    hello_api: [
      { path: 'backend/app/main.py', content: "from fastapi import FastAPI\napp = FastAPI()\n@app.get('/hello')\ndef hello(): return {'message': 'Hello World'}\n" },
    ],
    auth_jwt: [
      { path: 'backend/app/main.py',        content: "from fastapi import FastAPI\napp = FastAPI()\n" },
      { path: 'backend/app/routes/auth.py', content: "from fastapi import APIRouter\nfrom jose import jwt\nrouter = APIRouter()\n@router.post('/login')\ndef login(): pass\n@router.post('/register')\ndef register(): pass\n" },
    ],
    react_login: [
      { path: 'frontend/src/App.jsx', content: "import React, { useState } from 'react';\nexport default function App() {\n  const [password, setPassword] = useState('');\n  const login = () => fetch('/api/login', { method: 'POST' });\n  return <form>login<input type='password' /></form>;\n}\n" },
    ],
    crud_api: [
      { path: 'backend/app/main.py',    content: "from fastapi import FastAPI\nfrom sqlalchemy import Column, Integer, String\napp = FastAPI()\n@app.get('/tasks')\ndef list_tasks(): pass\n@app.post('/tasks')\ndef create_task(): pass\n" },
      { path: 'backend/app/models.py',  content: "from sqlalchemy.ext.declarative import declarative_base\nBase = declarative_base()\nclass Task(Base): pass\n" },
    ],
  };
  return mocks[test.id] || [];
}

// ── Storage ───────────────────────────────────────────────────────────────────

function _load() {
  try { return JSON.parse(fs.readFileSync(EVAL_FILE, 'utf8')); } catch { return { history: [], lastRun: null }; }
}

function _save(data) {
  const dir = path.dirname(EVAL_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(EVAL_FILE, JSON.stringify(data, null, 2));
}

// ── Core Runner ───────────────────────────────────────────────────────────────

/**
 * Run the eval suite and return a scored report.
 *
 * @param {object} options
 *   testIds {string[]}  — run only these test IDs (default: all)
 *   mock    {boolean}   — use mock file generation instead of real pipeline
 */
async function runEval(options = {}) {
  const mock  = options.mock  ?? (process.env.MOCK === 'true');
  const suite = options.testIds
    ? TEST_SUITE.filter(t => options.testIds.includes(t.id))
    : TEST_SUITE;

  const runId    = `eval_${Date.now()}`;
  const wallStart = Date.now();
  const results  = [];

  console.log(`\n🧪 Eval Suite — ${suite.length} tests (${mock ? 'mock' : 'live'} mode)\n`);

  for (const test of suite) {
    const tStart = Date.now();
    let files = [];
    let error  = null;

    try {
      if (mock) {
        files = _mockFiles(test);
      } else {
        const { generateCode } = require('../orchestrator');
        const r = await generateCode(test.prompt);
        files = Array.isArray(r) ? r : [];
      }

      if (test.minFiles && files.length < test.minFiles) {
        results.push({ id: test.id, name: test.name, passed: false, reason: `Need ≥${test.minFiles} files, got ${files.length}`, filesGenerated: files.length, durationMs: Date.now() - tStart });
        console.log(`  ❌ ${test.name}: not enough files`);
        continue;
      }

      const { passed, details } = test.score(files);
      results.push({ id: test.id, name: test.name, passed, reason: passed ? 'All criteria met' : `Failed: ${JSON.stringify(details)}`, filesGenerated: files.length, durationMs: Date.now() - tStart });
      console.log(`  ${passed ? '✅' : '❌'} ${test.name}`);

    } catch (err) {
      error = err.message;
      results.push({ id: test.id, name: test.name, passed: false, reason: `Exception: ${error}`, filesGenerated: 0, durationMs: Date.now() - tStart });
      console.log(`  ❌ ${test.name}: ${error}`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const total  = results.length;
  const score  = total ? Math.round((passed / total) * 100) : 0;

  const evalResult = {
    runId,
    timestamp:  Date.now(),
    durationMs: Date.now() - wallStart,
    score,
    passed,
    total,
    tests: results,
  };

  const data = _load();
  data.history  = [evalResult, ...(data.history || [])].slice(0, MAX_HISTORY);
  data.lastRun  = evalResult;
  _save(data);

  console.log(`\n📊 Eval Score: ${passed}/${total} (${score}%)\n`);
  return evalResult;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

function getEvalHistory() {
  return _load();
}

function getTrend() {
  const data    = _load();
  const history = (data.history || []).slice(0, 6).reverse(); // oldest→newest
  const scores  = history.map(r => r.score);

  let trend = 'unknown';
  if (scores.length >= 2) {
    const first = scores[0];
    const last  = scores[scores.length - 1];
    trend = last > first ? 'improving' : last < first ? 'declining' : 'stable';
  }

  return { trend, scores, latest: data.lastRun };
}

/**
 * Identify which test categories consistently fail.
 */
function getWeakAreas() {
  const data = _load();
  const history = data.history || [];
  const failCounts = {};

  history.slice(0, 5).forEach(run => {
    (run.tests || []).filter(t => !t.passed).forEach(t => {
      failCounts[t.id] = (failCounts[t.id] || 0) + 1;
    });
  });

  return Object.entries(failCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => {
      const test = TEST_SUITE.find(t => t.id === id);
      return { id, name: test?.name || id, failCount: count, prompt: test?.prompt };
    });
}

module.exports = { runEval, getEvalHistory, getTrend, getWeakAreas, TEST_SUITE };
