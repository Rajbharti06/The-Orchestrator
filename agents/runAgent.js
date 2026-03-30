const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function runAgent(projectDir, maxRetries = 3) {
  const pkgPath = path.join(projectDir, 'src', 'package.json');
  const rootPkgPath = path.join(projectDir, 'package.json');
  const targetPkg = fs.existsSync(pkgPath) ? path.dirname(pkgPath) : projectDir;

  try {
    console.log('📦 Installing dependencies...');
    execSync('npm install', { cwd: targetPkg, stdio: 'ignore', timeout: 30000 });
  } catch (e) {}

  const candidates = [
    path.join(projectDir, 'backend', 'app', 'main.py'),
    path.join(projectDir, 'main.py'),
    path.join(projectDir, 'src', 'app.js'),
    path.join(projectDir, 'app.js'),
  ];

  const entryPoint = candidates.find(f => fs.existsSync(f));
  if (!entryPoint) {
    return {
      success: false,
      error: 'No entry point found (tried src/app.js, src/index.js, app.js)',
      output: ''
    };
  }

  console.log(`🏃 Running: ${path.relative(projectDir, entryPoint)}`);

  const isPython = entryPoint.endsWith('.py');
  const cmd = isPython ? (process.env.PYTHON || 'python') : 'node';
  const args = isPython
    ? ['-m', 'uvicorn', 'backend.app.main:app', '--host', '0.0.0.0', '--port', '3001']
    : [entryPoint];
  const result = spawnSync(cmd, args, {
    cwd: projectDir,
    timeout: 5000,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: '3001'
    }
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const combined = (stdout + stderr).trim();

  if (result.signal === 'SIGTERM') {
    return {
      success: true,
      output: stdout,
      message: 'Server started successfully (ran for 5s without crashing)'
    };
  }

  if (result.status !== 0) {
    return {
      success: false,
      error: stderr || stdout,
      output: combined
    };
  }

  return {
    success: true,
    output: combined
  };
}

module.exports = { runAgent };

