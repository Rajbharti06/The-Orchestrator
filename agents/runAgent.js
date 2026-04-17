const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const STARTUP_TIMEOUT_MS = parseInt(process.env.RUN_TIMEOUT_MS || '8000', 10);

async function runAgent(projectDir, maxRetries = 3) {
  const pkgPath = path.join(projectDir, 'src', 'package.json');
  const targetPkg = fs.existsSync(pkgPath) ? path.dirname(pkgPath) : projectDir;

  try {
    console.log('📦 Installing dependencies...');
    execSync('npm install', { cwd: targetPkg, stdio: 'ignore', timeout: 60000 });
  } catch (e) {
    console.warn('npm install failed (continuing):', e.message);
  }

  const candidates = [
    path.join(projectDir, 'backend', 'app', 'main.py'),
    path.join(projectDir, 'main.py'),
    path.join(projectDir, 'src', 'app.js'),
    path.join(projectDir, 'app.js'),
    path.join(projectDir, 'src', 'index.js'),
    path.join(projectDir, 'index.js'),
  ];

  const entryPoint = candidates.find(f => fs.existsSync(f));
  if (!entryPoint) {
    return {
      success: false,
      error: `No entry point found. Tried: ${candidates.map(c => path.relative(projectDir, c)).join(', ')}`,
      output: '',
    };
  }

  console.log(`🏃 Running: ${path.relative(projectDir, entryPoint)}`);

  const isPython = entryPoint.endsWith('.py');
  const cmd = isPython ? (process.env.PYTHON || 'python') : 'node';
  const args = isPython
    ? ['-m', 'uvicorn', 'backend.app.main:app', '--host', '0.0.0.0', '--port', '3001', '--no-access-log']
    : [entryPoint];

  let lastResult;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = spawnSync(cmd, args, {
      cwd: projectDir,
      timeout: STARTUP_TIMEOUT_MS,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'development', PORT: '3001' },
    });

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const combined = (stdout + stderr).trim();

    if (result.signal === 'SIGTERM') {
      return {
        success: true,
        output: stdout,
        message: `Server started (ran for ${STARTUP_TIMEOUT_MS / 1000}s without crashing)`,
      };
    }

    if (result.status === 0) {
      return { success: true, output: combined };
    }

    lastResult = { success: false, error: stderr || stdout || `exit code ${result.status}`, output: combined };
    if (attempt < maxRetries) {
      console.warn(`Run attempt ${attempt}/${maxRetries} failed. Retrying...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return lastResult || { success: false, error: 'All run attempts failed', output: '' };
}

module.exports = { runAgent };
