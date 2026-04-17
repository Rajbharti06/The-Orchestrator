try { require('dotenv').config(); } catch (e) {
  try {
    const envPath = require('path').join(process.cwd(), '.env');
    const fsLocal = require('fs');
    if (fsLocal.existsSync(envPath)) {
      const txt = fsLocal.readFileSync(envPath, 'utf8');
      txt.split(/\r?\n/).forEach(line => {
        const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
        if (m) process.env[m[1]] = m[2];
      });
    }
  } catch (_) {}
}
let winstonLib;
try { winstonLib = require('winston'); require('winston-daily-rotate-file'); } catch (e) { winstonLib = null; }
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const winston = winstonLib;
const { backendAgent } = require('./agents/backendAgent');
const { uiAgent } = require('./agents/uiAgent');
const { plannerAgent } = require('./agents/plannerAgent');
const { qaAgent } = require('./agents/qaAgent');
const { fixAgent } = require('./agents/fixAgent');
const { githubAgent } = require('./agents/githubAgent');
const { deployAgent } = require('./agents/deployAgent');
const { runAgent } = require('./agents/runAgent');
const { apiTesterAgent } = require('./agents/apiTesterAgent');
const { deployApp } = require('./agents/hostingRouter');
const emitter = require('./lib/logsEmitter');
const { templatesForPrompt } = require('./lib/requirementTemplates');
const { recordLesson, getRelevantLessons, formatLessonsForPrompt } = require('./lib/lessonStore');
const { recordSuccess, getSuccessPatterns, formatSuccessesForPrompt } = require('./lib/successLearner');
const { decomposeGoal, formatStrategyForPrompt, isComplexPrompt } = require('./lib/strategyLayer');
const { architectAgent, formatSpecForPrompt } = require('./agents/architectAgent');
const { searchForError } = require('./agents/webSearchAgent');
const { initDefaultSubsystems, runHealthCheck } = require('./lib/selfHeal');

// Logging configuration
const transport = winstonLib ? new winstonLib.transports.DailyRotateFile({
  filename: 'logs/orchestrator-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d'
}) : null;

// Ensure logs directory exists
try { fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true }); } catch (e) {}

const logger = winstonLib ? winstonLib.createLogger({
  level: 'info',
  format: winstonLib.format.combine(
    winstonLib.format.timestamp(),
    winstonLib.format.json()
  ),
  transports: [
    transport,
    new winstonLib.transports.Console({
      format: winstonLib.format.combine(
        winstonLib.format.colorize(),
        winstonLib.format.simple()
      )
    })
  ]
}) : { info: console.log, warn: console.warn, error: console.error };

async function generateCode(prompt) {
  const startTime = Date.now();
  console.log('\n🧠 Starting Orchestration Process...');
  emitter.emit('phase', 'planning');
  logger.info(`Prompt received: "${prompt}"`);
  emitter.emit('log', `Prompt received: ${prompt}`);

  if (
    process.env.MOCK !== "true" &&
    !(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OLLAMA_BASE_URL ||
      process.env.XAI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY ||
      process.env.MISTRAL_API_KEY || process.env.GEMINI_API_KEY || process.env.DEEPSEEK_API_KEY)
  ) {
    logger.error("No LLM provider configured.");
    throw new Error("No LLM provider configured.");
  }

  // Subsystem health check — verify all internal components before starting
  try {
    initDefaultSubsystems();
    const health = await runHealthCheck();
    const degraded = Object.entries(health).filter(([, s]) => s !== 'healthy' && s !== null);
    if (degraded.length) {
      logger.warn(`Subsystem health issues: ${degraded.map(([n, s]) => `${n}=${s}`).join(', ')}`);
      emitter.emit('log', `Health: ${degraded.map(([n, s]) => `${n}=${s}`).join(', ')}`);
    }
  } catch (_) {}

  try {
    const sharedContext = {
      stack: {
        backend: "FastAPI (Python)",
        frontend: "React (JS + Tailwind)",
        database: "PostgreSQL"
      }
    };
    let allFiles = [];
    const outputBase = (process.env.OUTPUT_DIR && process.env.OUTPUT_DIR.trim()) ? process.env.OUTPUT_DIR.trim() : process.cwd();
    function resolveFullPath(relOrAbs) {
      return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(outputBase, relOrAbs);
    }
    async function retry(fn, retries = 3, delayMs = 1000) {
      try { return await fn(); } catch (e) {
        if (retries <= 1) throw e;
        await new Promise(r => setTimeout(r, delayMs));
        return retry(fn, retries - 1, delayMs);
      }
    }
    function dedupFiles(files) {
      const map = new Map();
      for (const f of files) {
        if (!map.has(f.path)) {
          map.set(f.path, f);
        } else {
          const isUI = f.path.endsWith('.jsx') || f.path.endsWith('.tsx');
          const contentHasReact = /React|useState|useEffect/.test(f.content);
          if (isUI && contentHasReact) map.set(f.path, f);
        }
      }
      return Array.from(map.values());
    }
    function filterByStack(files, stack) {
      const out = [];
      for (const f of files) {
        const p = f.path.toLowerCase();
        // Drop Vue files always
        if (p.endsWith('.vue')) continue;
        // Backend enforcement: keep .py for backend when FastAPI
        if (stack.backend.includes('FastAPI')) {
          // Remove common Node backend files
          if (p === 'src/app.js' || p.startsWith('src/routes/') && p.endsWith('.js') || p === 'server.js') continue;
        }
        // Frontend enforcement: prefer .jsx over .js duplicates
        if (stack.frontend.includes('React')) {
          // If both index.jsx and index.js exist, we will keep .jsx via dedup later
        }
        out.push(f);
      }
      return out;
    }
    function filterFilesStrict(files, stack) {
      const allowedExt = new Set(['.py', '.jsx', '.css', '.html', '.json']);
      const filtered = [];
      for (const f of files) {
        const ext = (f.path.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
        if (!allowedExt.has(ext)) continue;
        // Enforce backend location for Python
        if (ext === '.py' && !f.path.toLowerCase().startsWith('backend/')) continue;
        // Enforce frontend location for React/CSS/HTML
        if ((ext === '.jsx' || ext === '.css' || ext === '.html') && !f.path.toLowerCase().startsWith('frontend/')) continue;
        filtered.push(f);
      }
      return filtered;
    }
    function isValidStack(files, stack) {
      // No disallowed extensions remain
      const disallowed = files.filter(f => {
        const ext = (f.path.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
        return ['.vue', '.ts', '.mjs'].includes(ext);
      });
      if (disallowed.length) return false;
      // Must include core backend entry for FastAPI
      if (stack.backend.includes('FastAPI')) {
        const hasMain = files.some(f => f.path.toLowerCase() === 'backend/app/main.py');
        const hasAuth = files.some(f => f.path.toLowerCase().includes('backend/app/routes') && f.path.toLowerCase().endsWith('auth.py'));
        if (!hasMain || !hasAuth) return false;
      }
      // If React frontend selected, ensure App.jsx exists
      if (stack.frontend.includes('React')) {
        const hasApp = files.some(f => f.path.toLowerCase() === 'frontend/src/app.jsx');
        if (!hasApp) return false;
      }
      return true;
    }
    function validateBackendContract(files) {
      const pyFiles = files.filter(f => f.path.toLowerCase().endsWith('.py'));
      let fastapiOk = false;
      let appOk = false;
      let decoratorsOk = false;
      let forbiddenHit = false;
      for (const f of pyFiles) {
        const c = f.content || '';
        if (c.includes('from fastapi') || c.includes('FastAPI')) fastapiOk = true;
        if (c.includes('app = FastAPI(')) appOk = true;
        if (c.includes('@app.get') || c.includes('@app.post') || c.includes('APIRouter(')) decoratorsOk = true;
        if (c.includes('require(') || c.toLowerCase().includes('express') || c.toLowerCase().includes('vue')) forbiddenHit = true;
      }
      const valid = fastapiOk && appOk && decoratorsOk && !forbiddenHit;
      const violations = [];
      if (!fastapiOk) violations.push('FastAPI import missing');
      if (!appOk) violations.push('FastAPI app initialization missing');
      if (!decoratorsOk) violations.push('No route decorators found');
      if (forbiddenHit) violations.push('Forbidden framework references present');
      return { valid, violations };
    }
    function validateUIContract(files) {
      const jsxFiles = files.filter(f => f.path.toLowerCase().endsWith('.jsx'));
      let reactOk = false;
      let forbiddenHit = false;
      for (const f of jsxFiles) {
        const c = f.content || '';
        if (c.includes("from 'react'") || c.includes('import React')) reactOk = true;
        if (c.toLowerCase().includes('vue') || c.includes('<template>')) forbiddenHit = true;
      }
      const valid = reactOk && !forbiddenHit;
      const violations = [];
      if (!reactOk) violations.push('React import missing');
      if (forbiddenHit) violations.push('Forbidden frontend framework references present');
      return { valid, violations };
    }
    function validateContracts(files, stack) {
      const back = validateBackendContract(files);
      const ui = validateUIContract(files);
      const valid = back.valid && ui.valid;
      const issues = [];
      if (!back.valid) issues.push({ description: `Backend contract violated: ${back.violations.join('; ')}`, severity: 'high', fix: 'Generate FastAPI-compliant backend files' });
      if (!ui.valid) issues.push({ description: `UI contract violated: ${ui.violations.join('; ')}`, severity: 'high', fix: 'Generate React JSX frontend files' });
      return { valid, issues };
    }
    function extractIntentRequirements(prompt, stack) {
      const p = (prompt || '').toLowerCase();
      const req = { endpoints: [], requireJwt: false, requireHashing: false };
      if (/\bauth\b|\blogin\b|\bregister\b|\bsignup\b|\bpassword\b/.test(p)) {
        req.endpoints = ['/register', '/login', '/refresh', '/reset'];
        req.requireJwt = true;
        req.requireHashing = true;
      }
      return req;
    }
    function validateIntent(files, req) {
      if (!req || (!req.endpoints || req.endpoints.length === 0) && !req.requireJwt && !req.requireHashing) {
        return { valid: true, issues: [] };
      }
      const pyFiles = files.filter(f => f.path.toLowerCase().endsWith('.py'));
      const foundEndpoints = new Set();
      let jwtOk = false;
      let hashOk = false;
      const hasEndpoint = (content, ep) => {
        const r = new RegExp(`@(?:app|router)\\.(?:get|post|put|delete|patch)\\(\\s*['"][^'"]*${ep}[^'"]*['"]\\s*\\)`);
        return r.test(content);
      };
      for (const f of pyFiles) {
        const c = f.content || '';
        if (/\bjwt\b/i.test(c) || /\bjose\b/i.test(c)) jwtOk = true;
        if (/\bpasslib\b/i.test(c) || /\bbcrypt\b/i.test(c)) hashOk = true;
        for (const ep of req.endpoints || []) {
          if (hasEndpoint(c, ep)) foundEndpoints.add(ep);
        }
      }
      const missing = (req.endpoints || []).filter(ep => !foundEndpoints.has(ep));
      const issues = [];
      if (missing.length) {
        issues.push({ description: `Missing required endpoints: ${missing.join(', ')}`, severity: 'high', fix: `Add FastAPI routes for ${missing.join(', ')}` });
      }
      if (req.requireJwt && !jwtOk) {
        issues.push({ description: 'JWT support not detected in backend', severity: 'high', fix: 'Add JWT auth using jose or pyjwt and integrate with login route' });
      }
      if (req.requireHashing && !hashOk) {
        issues.push({ description: 'Password hashing not detected in backend', severity: 'high', fix: 'Use passlib CryptContext or bcrypt to hash and verify passwords' });
      }
      return { valid: issues.length === 0, issues };
    }
    function validateSharedContract(files) {
      const pyFiles = files.filter(f => f.path.toLowerCase().endsWith('.py'));
      const jsxFiles = files.filter(f => f.path.toLowerCase().endsWith('.jsx'));
      const backendEndpoints = new Set();
      const frontendCalls = new Set();

      // Extract backend endpoints
      const endpointRegex = /@(?:app|router)\.(?:get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
      for (const f of pyFiles) {
        let match;
        while ((match = endpointRegex.exec(f.content)) !== null) {
          backendEndpoints.add(match[1]);
        }
      }

      // Extract frontend API calls (simple regex for fetch/axios)
      const apiCallRegex = /(?:fetch|axios\.(?:get|post|put|delete|patch))\(\s*['"]([^'"]+)['"]/g;
      for (const f of jsxFiles) {
        let match;
        while ((match = apiCallRegex.exec(f.content)) !== null) {
          const url = match[1];
          // Basic heuristic: if it starts with / or http, it's an API call
          if (url.startsWith('/') || url.startsWith('http')) {
            // Normalize: remove host if present, keep path
            const pathMatch = url.match(/https?:\/\/[^\/]+(\/.*)/);
            frontendCalls.add(pathMatch ? pathMatch[1] : url);
          }
        }
      }

      const issues = [];
      for (const call of frontendCalls) {
        // Simple matching: check if the call path exists in backend endpoints
        // We might need better matching (e.g. handle path parameters /user/:id vs /user/{id})
        let matched = false;
        for (const endpoint of backendEndpoints) {
          const normalizedEndpoint = endpoint.replace(/\{[^\}]+\}/g, ':param');
          const normalizedCall = call.replace(/\/api\//, '/').split('?')[0]; // simple normalization
          if (normalizedCall === endpoint || normalizedCall === normalizedEndpoint) {
            matched = true;
            break;
          }
        }
        if (!matched && backendEndpoints.size > 0) {
          issues.push({
            description: `Frontend calls unknown endpoint: ${call}`,
            severity: 'high',
            fix: `Align frontend API call "${call}" with one of the backend endpoints: ${Array.from(backendEndpoints).join(', ')}`
          });
        }
      }

      return { valid: issues.length === 0, issues };
    }
    function normalizeRequirements(reqs, prompt, memory) {
      function pri(v) {
        const m = String(v).toLowerCase();
        if (m.includes('login') || m.includes('register') || m.includes('jwt') || m.includes('password-hashing')) return 'critical';
        if (m.includes('transactions') || m.includes('accounts') || m.includes('database') || m.includes('websocket')) return 'high';
        return 'medium';
      }
      const set = new Map();
      const templates = templatesForPrompt(prompt);
      const order = { low: 0, medium: 1, high: 2, critical: 3 };
      const put = (t, v, p, source, extra) => {
        const key = `${t}:${v}`;
        const existing = set.get(key);
        const conf = source === 'template' ? 0.92 : source === 'planner' ? 0.8 : 0.7;
        const item = { type: t, value: v, priority: p, confidence: conf, ...(extra || {}) };
        if (!existing) set.set(key, item);
        else if (order[p] > order[existing.priority || 'medium']) set.set(key, { ...item, confidence: Math.max(conf, existing.confidence || 0.7) });
      };
      templates.forEach(r => put(r.type, r.value, r.priority, 'template'));
      (reqs || []).forEach(r => {
        if (!r) return;
        if (typeof r === 'string') {
          const s = r.toLowerCase();
          const endpoints = Array.from(new Set((s.match(/\/[a-z0-9/_-]+/gi) || [])));
          endpoints.forEach(ep => put('endpoint', ep, pri(ep), 'inferred'));
          if (/\bauth|authentication|jwt\b/.test(s)) {
            put('capability', 'jwt', 'critical', 'inferred');
          }
          if (/\bhash|password[-\s]?hash|bcrypt|passlib\b/.test(s)) {
            put('capability', 'password-hashing', 'critical', 'inferred');
          }
          if (/\bdatabase|schema|model\b/.test(s)) {
            put('capability', 'database', 'high', 'inferred');
          }
          if (/\btransaction\b/.test(s)) {
            put('endpoint', '/transactions', 'high', 'inferred');
          }
          if (/\bchat\b/.test(s)) {
            put('endpoint', '/messages', 'high', 'inferred');
            put('capability', 'websocket', 'high', 'inferred');
          }
        } else if (typeof r === 'object' && r.type && r.value) {
          const t = String(r.type).toLowerCase();
          const v = String(r.value);
          const pr = r.priority ? String(r.priority).toLowerCase() : pri(v);
          const item = { 
            type: t, 
            value: v, 
            priority: pr,
            method: r.method,
            requestBody: r.requestBody,
            response: r.response
          };
          put(t, v, pr, 'planner', item);
        }
      });
      const mem = memory || {};
      const recent = Array.isArray(mem.lastIssues) ? mem.lastIssues : [];
      const failureCounts = new Map();
      recent.forEach(entry => {
        const arr = entry.issues || [];
        arr.forEach(i => {
          const d = String(i.description || '').toLowerCase();
          const t = d.includes('endpoint') ? 'endpoint' : d.includes('capability') ? 'capability' : d.includes('schema') ? 'schema' : 'other';
          let v = '';
          if (t === 'endpoint') {
            const m = d.match(/([\/a-z0-9_-]+)/i);
            if (m) v = m[1];
          } else if (t === 'capability') {
            if (d.includes('jwt')) v = 'jwt';
            else if (d.includes('hash')) v = 'password-hashing';
            else if (d.includes('database')) v = 'database';
            else if (d.includes('websocket')) v = 'websocket';
          }
          if (v) {
            const key = `${t}:${v}`;
            const count = (failureCounts.get(key) || 0) + 1;
            failureCounts.set(key, count);
          }
        });
      });
      failureCounts.forEach((count, key) => {
        const [t, v] = key.split(':');
        const ex = set.get(key);
        if (ex) {
          const newPriority = count >= 2 ? 'critical' : count >= 1 ? 'high' : ex.priority;
          set.set(key, { ...ex, priority: newPriority, confidence: 0.98 });
        } else if (count >= 2) {
          // If it failed twice but isn't in current requirements, add it as critical
          put(t, v, 'critical', 'memory');
        }
      });
      return Array.from(set.values());
    }
    function validateRequirements(files, reqs) {
      const pyFiles = files.filter(f => f.path.toLowerCase().endsWith('.py'));
      const issues = [];
      const hasEndpoint = (content, ep) => {
        const r = new RegExp(`@(?:app|router)\\.(?:get|post|put|delete|patch)\\(\\s*['"][^'"]*${ep}[^'"]*['"]\\s*\\)`);
        return r.test(content);
      };
      const contentAll = pyFiles.map(f => f.content || '').join('\n');
      const hasJwt = /\bjwt\b/i.test(contentAll) || /\bjose\b/i.test(contentAll);
      const hasHash = /\bpasslib\b/i.test(contentAll) || /\bbcrypt\b/i.test(contentAll);
      const hasDb = /\bsqlalchemy\b/i.test(contentAll) || /\bpsycopg2\b/i.test(contentAll) || /\basyncpg\b/i.test(contentAll);
      const hasWs = /\bWebSocket\b/.test(contentAll) || /\bwebsocket\b/i.test(contentAll);
      for (const r of reqs || []) {
        if (r.type === 'endpoint') {
          let ok = false;
          for (const f of pyFiles) {
            if (hasEndpoint(f.content || '', r.value)) { ok = true; break; }
          }
          if (!ok) {
            const sev = r.priority === 'critical' ? 'critical' : r.priority === 'high' ? 'high' : r.priority || 'medium';
            issues.push({ description: `Missing endpoint: ${r.value}`, severity: sev, fix: `Add FastAPI route for ${r.value}` });
          }
        } else if (r.type === 'capability') {
          const v = String(r.value).toLowerCase();
          const sev = r.priority === 'critical' ? 'critical' : r.priority === 'high' ? 'high' : r.priority || 'medium';
          if (v.includes('jwt') && !hasJwt) issues.push({ description: 'JWT capability missing', severity: sev, fix: 'Integrate JWT (pyjwt or jose) in auth flow' });
          if ((v.includes('hash') || v.includes('password-hashing')) && !hasHash) issues.push({ description: 'Password hashing capability missing', severity: sev, fix: 'Use passlib CryptContext or bcrypt for hashing and verification' });
          if (v.includes('database') && !hasDb) issues.push({ description: 'Database integration missing', severity: sev === 'critical' ? 'high' : sev, fix: 'Add SQLAlchemy models and PostgreSQL connection' });
          if (v.includes('websocket') && !hasWs) issues.push({ description: 'WebSocket capability missing', severity: sev, fix: 'Add FastAPI WebSocket endpoint' });
        } else if (r.type === 'schema') {
          const v = String(r.value).toLowerCase();
          const entityRegex = new RegExp(`class\\s+${v.replace(/[^a-z0-9]/gi, '')}\\b`, 'i');
          const modelOk = pyFiles.some(f => entityRegex.test(f.content || '')) || /\bBase\b/.test(contentAll);
          if (!modelOk) {
            const sev = r.priority === 'critical' ? 'high' : r.priority || 'medium';
            issues.push({ description: `Schema not found for: ${r.value}`, severity: sev, fix: `Define SQLAlchemy models for ${r.value}` });
          }
        }
      }
      const blocking = issues.some(i => i.severity === 'critical' || i.severity === 'high');
      return { valid: !blocking, issues };
    }
    function extractDependencies(files) {
      const deps = new Set();
      for (const f of files) {
        const reqs = f.content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
        reqs.forEach(m => {
          const p = m.replace(/.*require\(['"]([^'"]+)['"]\).*/, '$1');
          if (p && !p.startsWith('.')) deps.add(p);
        });
        const imps = f.content.match(/from ['"]([^'"]+)['"]/g) || [];
        imps.forEach(m => {
          const p = m.replace(/from ['"]([^'"]+)['"]/, '$1');
          if (p && !p.startsWith('.')) deps.add(p);
        });
      }
      return Array.from(deps);
    }

    // Step 1: Create an execution plan
    console.log('📝 Planning development tasks...');
    logger.info('Calling plannerAgent to break down prompt...');
    const memoryStore = require('./lib/memoryStore');
    sharedContext.memory = memoryStore.summary();
    // Persist preferences (stack) so future runs can reuse
    memoryStore.setPreference('backend', sharedContext.stack.backend);
    memoryStore.setPreference('frontend', sharedContext.stack.frontend);
    memoryStore.setPreference('database', sharedContext.stack.database);
    const { computeAll } = require('./lib/providerScoring');
    sharedContext.providers = computeAll(sharedContext.memory);
    logger.info(`Providers selected: ${JSON.stringify(sharedContext.providers)}`);
    emitter.emit('log', `Providers: ${JSON.stringify(sharedContext.providers)}`);
    const plan = await plannerAgent(prompt, sharedContext);
    memoryStore.recordPrompt(prompt);
    logger.info(`Plan created with ${plan.tasks.length} tasks.`);
    emitter.emit('log', `Plan tasks: ${plan.tasks.length}`);
    sharedContext.requirements = normalizeRequirements(plan.requirements || [], prompt, sharedContext.memory);

    // Inject lessons from past failures — persistent memory improves every run
    const relevantLessons = getRelevantLessons(prompt);
    if (relevantLessons.length) {
      sharedContext.lessons = relevantLessons;
      sharedContext.lessonsBlock = formatLessonsForPrompt(relevantLessons);
      emitter.emit('log', `Past lessons injected: ${relevantLessons.length}`);
      logger.info(`Injecting ${relevantLessons.length} relevant lessons from past failures`);
    }

    // Inject success patterns (what worked before) — doubles the learning signal
    const successPatterns = getSuccessPatterns(prompt);
    if (successPatterns.length) {
      sharedContext.successBlock = formatSuccessesForPrompt(successPatterns);
      emitter.emit('log', `Success patterns injected: ${successPatterns.length}`);
      logger.info(`Injecting ${successPatterns.length} relevant success patterns`);
    }

    // Strategy Layer — multi-phase planning for complex prompts
    if (isComplexPrompt(prompt)) {
      try {
        console.log('🗺️  Building execution strategy (complex prompt detected)...');
        const strategy = await decomposeGoal(prompt, sharedContext.stack);
        sharedContext.strategy = strategy;
        sharedContext.strategyBlock = formatStrategyForPrompt(strategy);
        emitter.emit('log', `Strategy: ${strategy.phases.length} phases planned`);
        emitter.emit('react', { type: 'thought', content: `Strategy: ${strategy.goal}` });
        logger.info(`Strategy layer: ${strategy.phases.length} phases for "${strategy.goal}"`);
      } catch (stratErr) {
        logger.warn(`Strategy layer failed (non-fatal): ${stratErr.message}`);
      }
    }

    // Architect Agent — design before coding, so all downstream agents share one blueprint
    console.log('📐 Running Architect Agent (design phase)...');
    emitter.emit('phase', 'architect');
    emitter.emit('react', { type: 'thought', content: `Designing architecture for: "${prompt.substring(0, 100)}"` });
    try {
      const archSpec = await architectAgent(prompt, plan.stack || sharedContext.stack, {});
      if (archSpec && archSpec.files) {
        sharedContext.archSpec = archSpec;
        sharedContext.archBlock = formatSpecForPrompt(archSpec);
        if (archSpec.stack) {
          if (archSpec.stack.backend) sharedContext.stack.backend = archSpec.stack.backend;
          if (archSpec.stack.frontend) sharedContext.stack.frontend = archSpec.stack.frontend;
          if (archSpec.stack.database) sharedContext.stack.database = archSpec.stack.database;
        }
        emitter.emit('react', { type: 'observation', content: `Architect spec: ${archSpec.files.length} files, ${(archSpec.api_contracts || []).length} API contracts` });
        emitter.emit('log', `Architect: ${archSpec.files.length} files planned`);
        logger.info(`Architect spec ready: ${archSpec.files.length} files`);
      }
    } catch (archErr) {
      logger.warn(`Architect agent failed (non-fatal): ${archErr.message}`);
    }

    // Step 2: Execute tasks in PARALLEL (backend batch first, then UI batch)
    const { selectSkills } = require('./lib/skills');
    const backendTasks = plan.tasks.filter(t => t.type === 'backend');
    const uiTasks = plan.tasks.filter(t => t.type === 'ui');

    if (backendTasks.length) {
      console.log(`⚙️  Building ${backendTasks.length} backend file(s) in parallel...`);
      emitter.emit('phase', 'backend');
      const backendResults = await Promise.all(
        backendTasks.map(task => {
          logger.info(`Parallel backend task: "${task.description}"`);
          emitter.emit('log', `Backend: ${task.description.substring(0, 60)}`);
          const skills = selectSkills(task.description, sharedContext.stack);
          return retry(() => backendAgent(task.description, sharedContext, skills));
        })
      );
      for (const r of backendResults) {
        if (r && r.files) allFiles = allFiles.concat(r.files);
      }
    }

    if (uiTasks.length) {
      console.log(`🎨 Generating ${uiTasks.length} UI file(s) in parallel...`);
      emitter.emit('phase', 'ui');
      const uiResults = await Promise.all(
        uiTasks.map(task => {
          logger.info(`Parallel UI task: "${task.description}"`);
          emitter.emit('log', `UI: ${task.description.substring(0, 60)}`);
          const skills = selectSkills(task.description, sharedContext.stack);
          return retry(() => uiAgent(task.description, sharedContext, skills));
        })
      );
      for (const r of uiResults) {
        if (r && r.files) allFiles = allFiles.concat(r.files);
      }

    }

    // Step 3: QA and Fix Loop
    console.log('🧪 Auditing codebase (QA)...');
    logger.info('Starting QA Audit...');
    emitter.emit('phase', 'qa');
    const qaResult = await retry(() => qaAgent(allFiles, sharedContext));
    if (qaResult.hasIssues) {
      console.log(`🔧 Fixing ${qaResult.issues.length} issues found by QA...`);
      emitter.emit('phase', 'fix');
      logger.warn(`QA found ${qaResult.issues.length} issues. Severity: ${qaResult.issues[0].severity}. Starting Fix Loop...`);
      emitter.emit('log', `QA issues: ${qaResult.issues.length}`);
      const fixed = await fixAgent(allFiles, qaResult, sharedContext);
      allFiles = fixed;
      memoryStore.recordIssues(qaResult.issues || []);
      logger.info('Fix Loop completed.');
    } else {
      console.log('✅ QA Audit passed.');
      logger.info('QA Audit passed. No issues found.');
      emitter.emit('log', `QA passed`);
    }

    let finalFiles = filterByStack(dedupFiles(allFiles), sharedContext.stack);
    finalFiles = filterFilesStrict(finalFiles, sharedContext.stack);
    if (!plan.isFallback && !isValidStack(finalFiles, sharedContext.stack)) {
      logger.error('Invalid stack output detected after fix loop — rejecting files.');
      throw new Error('Invalid stack output');
    }
    {
      let attempts = 2;
      while (attempts > 0) {
        const contractCheck = validateContracts(finalFiles, sharedContext.stack);
        if (contractCheck.valid) break;
        logger.warn('Contract validation failed, attempting auto-repair.');
        const qaResult = { hasIssues: true, issues: contractCheck.issues };
        memoryStore.recordIssues(contractCheck.issues);
        const fixed = await fixAgent(finalFiles, qaResult, sharedContext);
        finalFiles = filterFilesStrict(filterByStack(dedupFiles(fixed), sharedContext.stack), sharedContext.stack);
        attempts -= 1;
      }
      const finalContract = validateContracts(finalFiles, sharedContext.stack);
      if (!finalContract.valid) {
        logger.error('Contract violations persist — rejecting files.');
        throw new Error('Invalid backend/frontend implementation');
      }
    }
    {
      if (sharedContext.requirements && sharedContext.requirements.length && process.env.MOCK !== "true") {
        let attempts = 2;
        while (attempts > 0) {
          const reqCheck = validateRequirements(finalFiles, sharedContext.requirements);
          if (reqCheck.valid) break;
          logger.warn('Requirements validation failed, attempting auto-repair.');
          emitter.emit('log', `Requirement issues: ${reqCheck.issues.map(i => i.description).join(' | ')}`);
          const qaResult = { hasIssues: true, issues: reqCheck.issues };
          memoryStore.recordIssues(reqCheck.issues);
          const fixed = await fixAgent(finalFiles, qaResult, sharedContext);
          finalFiles = filterFilesStrict(filterByStack(dedupFiles(fixed), sharedContext.stack), sharedContext.stack);
          attempts -= 1;
        }
        const finalReqCheck = validateRequirements(finalFiles, sharedContext.requirements);
        if (!finalReqCheck.valid) {
          logger.error('Requirement violations persist — rejecting files.');
          throw new Error('Dynamic requirements not satisfied');
        }
      } else {
        logger.info('Requirements check skipped (mock or none).');
      }
    }
    {
      const intentReq = extractIntentRequirements(prompt, sharedContext.stack);
      if (intentReq && (intentReq.endpoints && intentReq.endpoints.length || intentReq.requireJwt || intentReq.requireHashing)) {
        let attempts = 2;
        while (attempts > 0) {
          const intentCheck = validateIntent(finalFiles, intentReq);
          if (intentCheck.valid) break;
          logger.warn('Intent validation failed, attempting auto-repair.');
          emitter.emit('log', `Intent issues: ${intentCheck.issues.map(i => i.description).join(' | ')}`);
          const qaResult = { hasIssues: true, issues: intentCheck.issues };
          memoryStore.recordIssues(intentCheck.issues);
          const fixed = await fixAgent(finalFiles, qaResult, sharedContext);
          finalFiles = filterFilesStrict(filterByStack(dedupFiles(fixed), sharedContext.stack), sharedContext.stack);
          attempts -= 1;
        }
        const finalIntent = validateIntent(finalFiles, intentReq);
        if (!finalIntent.valid) {
          logger.error('Intent violations persist — rejecting files.');
          throw new Error('Intent requirements not satisfied');
        }
      }
    }
    {
      // NEW: Shared contract validation (Backend vs Frontend alignment)
      let attempts = 2;
      while (attempts > 0) {
        const sharedCheck = validateSharedContract(finalFiles);
        if (sharedCheck.valid) break;
        logger.warn('Shared contract validation failed, attempting auto-repair.');
        emitter.emit('log', `Shared contract issues: ${sharedCheck.issues.map(i => i.description).join(' | ')}`);
        const qaResult = { hasIssues: true, issues: sharedCheck.issues };
        memoryStore.recordIssues(sharedCheck.issues);
        const fixed = await fixAgent(finalFiles, qaResult, sharedContext);
        finalFiles = filterFilesStrict(filterByStack(dedupFiles(fixed), sharedContext.stack), sharedContext.stack);
        attempts -= 1;
      }
      const finalShared = validateSharedContract(finalFiles);
      if (!finalShared.valid) {
        logger.error('Shared contract violations persist — rejecting files.');
        throw new Error('Shared contract between backend and UI is broken');
      }
    }

    // Ensure FastAPI router is wired (especially for mock mode)
    const mainPy = finalFiles.find(f => f.path.includes('main.py'));
    const authPy = finalFiles.find(f => f.path.includes('routes/auth.py'));
    if (mainPy && authPy && !mainPy.content.includes('include_router')) {
      mainPy.content += '\nfrom backend.app.routes import auth\napp.include_router(auth.router, prefix="/api")\n';
    }

    for (const file of finalFiles) {
      const filePath = resolveFullPath(file.path);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, file.content);
      logger.info(`File written: ${file.path}`);
      emitter.emit('log', `File written: ${file.path}`);
    }
    const { execSync } = require('child_process');
    const deps = extractDependencies(finalFiles);
    try {
      const pkgPath = path.join(outputBase, 'package.json');
      let installed = [];
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        installed = Object.keys(pkg.dependencies || {});
      }
      const missing = deps.filter(d => !installed.includes(d));
      if (missing.length) {
        console.log(`📦 Installing missing deps: ${missing.join(' ')}`);
        execSync(`npm install ${missing.join(' ')}`, { cwd: outputBase, stdio: 'ignore' });
      }
      const pyFiles = finalFiles.filter(f => f.path.endsWith('.py'));
      if (pyFiles.length) {
        try {
          execSync('pip install fastapi uvicorn python-jose passlib bcrypt sqlalchemy python-multipart --quiet', { cwd: outputBase, stdio: 'ignore', timeout: 30000 });
          console.log('📦 Python dependencies installed');
        } catch (e) {
          console.log('⚠️ Python dep install failed, continuing...');
        }
      }
    } catch (e) {}

    console.log('🏃 Running generated code...');
    emitter.emit('phase', 'test');
    logger.info('Starting Run-and-Correct loop...');
    const MAX_FIX_ATTEMPTS = 5;
    let runSuccess = false;
    for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      const runResult = await runAgent(outputBase);
      if (runResult.success) {
        console.log(`✅ Code starts successfully!`);
        
        // NEW: Runtime API Testing
        console.log(`🧪 Starting Runtime API Validation...`);
        logger.info('Starting API Tester Agent...');
        const apiTestResult = await apiTesterAgent(outputBase, sharedContext);
        
        if (apiTestResult.success) {
          console.log(`✅ API Validation passed! All endpoints responded correctly.`);
          logger.info('Run-and-Correct: code executed and API validated successfully.');
          emitter.emit('log', `Run and API success`);
          runSuccess = true;
          // Record success patterns so future builds can replicate this
          recordSuccess(prompt, finalFiles, {
            passedQA: !qaResult.hasIssues,
            runSuccess: true,
            apiTestSuccess: true,
            durationMs: Date.now() - startTime,
          }).catch(() => {});
          break;
        } else {
          console.log(`⚠️  API Validation failed. ${apiTestResult.issues ? apiTestResult.issues.length : 0} runtime issues detected.`);
          logger.warn(`API Testing failed: ${apiTestResult.error || 'issues detected'}`);
          emitter.emit('log', `API Testing failed: ${apiTestResult.error || 'issues detected'}`);
          
          const apiQaResult = {
            hasIssues: true,
            issues: apiTestResult.issues || [{
              description: `API Runtime Error: ${apiTestResult.error}`,
              severity: 'high',
              fix: 'Fix the backend implementation to ensure endpoints respond correctly.'
            }]
          };
          
          memoryStore.recordIssues(apiQaResult.issues);
          allFiles = await fixAgent(finalFiles, apiQaResult, sharedContext);
        }
      } else {
        console.log(`⚠️  Attempt ${attempt}/${MAX_FIX_ATTEMPTS} failed to start. Auto-fixing...`);
        logger.warn(`Run failed (attempt ${attempt}): ${runResult.error}`);
        emitter.emit('log', `Run failed: ${runResult.error}`);
        emitter.emit('react', { type: 'thought', content: `Run failed: ${(runResult.error || '').substring(0, 120)}` });

        // Search the web for runtime error solutions before attempting a fix
        const webCtx = await searchForError(runResult.error, sharedContext.stack).catch(() => '');
        if (webCtx) emitter.emit('react', { type: 'observation', content: `Web search found solutions` });

        const runtimeQaResult = {
          hasIssues: true,
          issues: [{
            description: `Runtime error when executing the app: ${runResult.error}`,
            severity: 'high',
            fix: 'Fix the code so it runs without errors',
            webContext: webCtx || undefined,
          }]
        };
        memoryStore.recordIssues(runtimeQaResult.issues);
        if (webCtx) sharedContext.webSearchContext = webCtx;
        allFiles = await fixAgent(finalFiles, runtimeQaResult, sharedContext);
        emitter.emit('react', { type: 'action', content: `Applied fix attempt ${attempt}` });
      }
      
      finalFiles = filterFilesStrict(filterByStack(dedupFiles(allFiles), sharedContext.stack), sharedContext.stack);
      for (const file of finalFiles) {
        const filePath = resolveFullPath(file.path);
        await fsp.mkdir(path.dirname(filePath), { recursive: true });
        await fsp.writeFile(filePath, file.content);
      }
    }
    if (!runSuccess) {
      console.log(`⚠️  Could not auto-fix after ${MAX_FIX_ATTEMPTS} attempts. Manual review needed.`);
      logger.warn('Run-and-Correct loop exhausted without success.');
    }

    // Step 4: Finalize with GitHub
    console.log('📦 Committing to GitHub...');
    logger.info('Finalizing with GitHub Agent...');
    const githubResult = await githubAgent(allFiles, 'generated-app');
    if (githubResult.success) {
      logger.info(`GitHub Action successful: ${githubResult.url}`);
      emitter.emit('log', `GitHub: ${githubResult.url}`);
    } else {
      logger.error(`GitHub Action failed: ${githubResult.error}`);
      emitter.emit('log', `GitHub failed`);
    }

    // Step 5: Deploy the App
    console.log('🚀 Deploying live app...');
    emitter.emit('phase', 'deploy');
    logger.info('Starting Deployment Agent...');
    sharedContext.files = finalFiles;
    const deployResult = await deployApp(outputBase, sharedContext);
    if (deployResult.success) {
      console.log(`\n🎉 Success! Your app is live at: ${deployResult.url}\n`);
      logger.info(`🚀 Deployment successful: ${deployResult.url}`);
       emitter.emit('log', `Deploy: ${deployResult.url}`);
      memoryStore.recordRun({ stack: sharedContext.stack, outputBase, url: deployResult.url, files: finalFiles.map(f => f.path) });
    } else {
      console.log(`⚠️  Deployment skipped: ${deployResult.message}`);
      logger.warn(`Deployment skipped or failed: ${deployResult.message}`);
      emitter.emit('log', `Deploy skipped: ${deployResult.message}`);
    }

    const duration = Date.now() - startTime;
    logger.info(`Total execution duration: ${duration}ms`);
    emitter.emit('log', `Done in ${duration}ms`);
    
    return allFiles;

  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message || String(error);
    const status = error.response?.status;
    if (status) {
      logger.error(`API Error ${status}: ${msg}`);
    } else {
      logger.error(`Orchestration error: ${msg}`);
    }
    emitter.emit('log', `Error: ${msg}`);
    emitter.emit('react', { type: 'observation', content: `Fatal error: ${msg.substring(0, 120)}` });

    // Every failure becomes a stored lesson — injected into future runs
    try {
      await recordLesson(prompt, [{ description: msg, severity: 'high', fix: 'Review error and fix root cause' }], []);
    } catch (_) {}

    throw error;
  }
}

if (require.main === module) {
  const prompt = process.argv[2];
  if (!prompt) {
    console.error("Please provide a prompt. Usage: node orchestrator.js \"build login system\"");
    process.exit(1);
  }

  generateCode(prompt)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Orchestration failed:", err.message);
      process.exit(1);
    });
}

module.exports = { generateCode };
