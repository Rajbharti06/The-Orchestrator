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
const { deployApp } = require('./agents/hostingRouter');
const emitter = require('./lib/logsEmitter');

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
  logger.info(`Prompt received: "${prompt}"`);
  emitter.emit('log', `Prompt received: ${prompt}`);

  if (
    process.env.MOCK !== "true" &&
    !(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OLLAMA_BASE_URL)
  ) {
    logger.error("No LLM provider configured (set GROQ_API_KEY, OPENROUTER_API_KEY, or OLLAMA_BASE_URL).");
    throw new Error("No LLM provider configured.");
  }

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

    // Step 2: Execute tasks in order
    for (const task of plan.tasks) {
      if (task.type === "backend") {
        console.log(`⚙️  Building Backend: ${task.description.substring(0, 50)}...`);
        logger.info(`Executing backend task: "${task.description}"`);
        emitter.emit('log', `Backend task: ${task.description}`);
        const { selectSkills } = require('./lib/skills');
        const skills = selectSkills(task.description, sharedContext.stack);
        const backendResult = await backendAgent(task.description, sharedContext, skills);
        if (backendResult && backendResult.files) {
          allFiles = allFiles.concat(backendResult.files);
        }
      }

      if (task.type === "ui") {
        console.log(`🎨 Generating UI: ${task.description.substring(0, 50)}...`);
        logger.info(`Executing UI task: "${task.description}"`);
        emitter.emit('log', `UI task: ${task.description}`);
        const { selectSkills } = require('./lib/skills');
        const skills = selectSkills(task.description, sharedContext.stack);
        const uiResult = await uiAgent(task.description, sharedContext, skills);
        if (uiResult && uiResult.files) {
          allFiles = allFiles.concat(uiResult.files);
        }
      }
    }

    // Step 3: QA and Fix Loop
    console.log('🧪 Auditing codebase (QA)...');
    logger.info('Starting QA Audit...');
    const qaResult = await retry(() => qaAgent(allFiles, sharedContext));
    if (qaResult.hasIssues) {
      console.log(`🔧 Fixing ${qaResult.issues.length} issues found by QA...`);
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
    if (!isValidStack(finalFiles, sharedContext.stack)) {
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
    } catch (e) {}

    console.log('🏃 Running generated code...');
    logger.info('Starting Run-and-Correct loop...');
    const MAX_FIX_ATTEMPTS = 3;
    let runSuccess = false;
    for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      const runResult = await runAgent(outputBase);
      if (runResult.success) {
        console.log(`✅ Code runs successfully!`);
        logger.info('Run-and-Correct: code executed successfully.');
        emitter.emit('log', `Run success`);
        runSuccess = true;
        break;
      }
      console.log(`⚠️  Attempt ${attempt}/${MAX_FIX_ATTEMPTS} failed. Auto-fixing...`);
      logger.warn(`Run failed (attempt ${attempt}): ${runResult.error}`);
      emitter.emit('log', `Run failed: ${runResult.error}`);
      const runtimeQaResult = {
        hasIssues: true,
        issues: [{
          description: `Runtime error when executing the app: ${runResult.error}`,
          severity: 'high',
          fix: 'Fix the code so it runs without errors'
        }]
      };
      allFiles = await fixAgent(finalFiles, runtimeQaResult, sharedContext);
      finalFiles = filterByStack(dedupFiles(allFiles), sharedContext.stack);
      for (const file of finalFiles) {
        const filePath = resolveFullPath(file.path);
        await fsp.mkdir(path.dirname(filePath), { recursive: true });
        await fsp.writeFile(filePath, file.content);
      }
    }
    if (!runSuccess) {
      console.log('⚠️  Could not auto-fix after 3 attempts. Manual review needed.');
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
    if (error.response) {
      logger.error(`API Error: Status ${error.response.status}, Message: ${error.response.data.error.message}`);
    } else {
      logger.error(`Error during orchestration: ${error.message}`);
    }
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
