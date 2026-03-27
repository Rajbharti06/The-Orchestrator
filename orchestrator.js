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
    const sharedContext = {};
    let allFiles = [];
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
    const plan = await plannerAgent(prompt);
    logger.info(`Plan created with ${plan.tasks.length} tasks.`);
    emitter.emit('log', `Plan tasks: ${plan.tasks.length}`);

    // Step 2: Execute tasks in order
    for (const task of plan.tasks) {
      if (task.type === "backend") {
        console.log(`⚙️  Building Backend: ${task.description.substring(0, 50)}...`);
        logger.info(`Executing backend task: "${task.description}"`);
        emitter.emit('log', `Backend task: ${task.description}`);
        const backendResult = await backendAgent(task.description, sharedContext);
        if (backendResult && backendResult.files) {
          allFiles = allFiles.concat(backendResult.files);
        }
      }

      if (task.type === "ui") {
        console.log(`🎨 Generating UI: ${task.description.substring(0, 50)}...`);
        logger.info(`Executing UI task: "${task.description}"`);
        emitter.emit('log', `UI task: ${task.description}`);
        const uiResult = await uiAgent(task.description, sharedContext);
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
      allFiles = await fixAgent(allFiles, qaResult, sharedContext);
      logger.info('Fix Loop completed.');
    } else {
      console.log('✅ QA Audit passed.');
      logger.info('QA Audit passed. No issues found.');
      emitter.emit('log', `QA passed`);
    }

    let finalFiles = dedupFiles(allFiles);
    for (const file of finalFiles) {
      const filePath = path.join(process.cwd(), file.path);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, file.content);
      logger.info(`File written: ${file.path}`);
      emitter.emit('log', `File written: ${file.path}`);
    }
    const { execSync } = require('child_process');
    const deps = extractDependencies(finalFiles);
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      let installed = [];
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        installed = Object.keys(pkg.dependencies || {});
      }
      const missing = deps.filter(d => !installed.includes(d));
      if (missing.length) {
        console.log(`📦 Installing missing deps: ${missing.join(' ')}`);
        execSync(`npm install ${missing.join(' ')}`, { cwd: process.cwd(), stdio: 'ignore' });
      }
    } catch (e) {}

    console.log('🏃 Running generated code...');
    logger.info('Starting Run-and-Correct loop...');
    const MAX_FIX_ATTEMPTS = 3;
    let runSuccess = false;
    for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      const runResult = await runAgent(process.cwd());
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
      finalFiles = dedupFiles(allFiles);
      for (const file of finalFiles) {
        const filePath = path.join(process.cwd(), file.path);
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
    const deployResult = await deployApp(process.cwd(), sharedContext);
    if (deployResult.success) {
      console.log(`\n🎉 Success! Your app is live at: ${deployResult.url}\n`);
      logger.info(`🚀 Deployment successful: ${deployResult.url}`);
       emitter.emit('log', `Deploy: ${deployResult.url}`);
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
