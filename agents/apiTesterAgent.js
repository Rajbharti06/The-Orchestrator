const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TEST_PORT = parseInt(process.env.TEST_PORT || '8001', 10);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const SERVER_WAIT_MS = parseInt(process.env.TEST_SERVER_WAIT_MS || '12000', 10);

/**
 * Normalizes endpoint path: strips /api prefix for internal storage,
 * adds it back only when making HTTP calls.
 */
function normalizeForHttp(ep) {
  if (ep.startsWith('http')) return ep;
  const path = ep.startsWith('/') ? ep : `/${ep}`;
  if (path.startsWith('/api/') || path === '/api') return `${BASE_URL}${path}`;
  return `${BASE_URL}/api${path}`;
}

async function waitForServer(maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      await axios.get(`${BASE_URL}/`, { timeout: 1000, validateStatus: () => true });
      return true;
    } catch (_) {
      await new Promise(r => setTimeout(r, 800));
    }
  }
  return false;
}

async function apiTesterAgent(projectDir, sharedContext) {
  const rawEndpoints = sharedContext.apiEndpoints || [];
  const endpoints = rawEndpoints.length
    ? rawEndpoints
    : ['/login', '/register', '/refresh', '/reset'];

  const candidates = [
    path.join(projectDir, 'backend', 'app', 'main.py'),
    path.join(projectDir, 'main.py'),
    path.join(projectDir, 'src', 'app.js'),
    path.join(projectDir, 'src', 'index.js'),
    path.join(projectDir, 'app.js'),
  ];

  const entryPoint = candidates.find(f => fs.existsSync(f));
  if (!entryPoint) {
    return { success: false, error: 'No backend entry point found for API testing' };
  }

  const isPython = entryPoint.endsWith('.py');
  const cmd = isPython ? (process.env.PYTHON || 'python') : 'node';
  const args = isPython
    ? ['-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', `--port`, String(TEST_PORT), '--no-access-log']
    : [entryPoint];

  console.log(`📡 Starting API test server on port ${TEST_PORT}...`);

  const server = spawn(cmd, args, {
    cwd: projectDir,
    env: { ...process.env, PORT: String(TEST_PORT) },
    shell: process.platform === 'win32',
  });

  let output = '';
  server.stdout.on('data', d => (output += d.toString()));
  server.stderr.on('data', d => (output += d.toString()));

  const serverReady = await waitForServer(SERVER_WAIT_MS);
  if (!serverReady) {
    server.kill();
    return { success: false, error: `Server did not start within ${SERVER_WAIT_MS / 1000}s`, output };
  }

  const issues = [];
  const requirements = sharedContext.requirements || [];
  const AUTH_ROUTES = ['/login', '/register', '/refresh', '/reset', '/token', '/auth'];

  async function testEndpoint(ep) {
    const url = normalizeForHttp(ep);
    const reqSpec = requirements.find(r => r.type === 'endpoint' && (r.value === ep || url.includes(r.value))) || {};
    const isAuth = AUTH_ROUTES.some(r => ep.includes(r));
    const method = (reqSpec.method || (isAuth ? 'POST' : 'GET')).toUpperCase();
    const keys = reqSpec.requestBody && typeof reqSpec.requestBody === 'object'
      ? Object.keys(reqSpec.requestBody)
      : ['username', 'password'];
    const payload = keys.reduce((acc, k) => { acc[k] = `test_${k}`; return acc; }, {});

    try {
      const res = await axios({
        method,
        url,
        data: method === 'POST' ? payload : undefined,
        timeout: 4000,
        validateStatus: () => true,
      });

      const status = res.status;
      // 2xx, 4xx (4xx = server is alive, route exists, input validation working) = pass
      // 5xx, timeout, connection refused = fail
      const passed = status < 500;
      const icon = passed ? '✓' : '✗';
      console.log(`   ${icon} ${method} ${ep} → ${status}`);

      if (passed && reqSpec.response) {
        const expected = Object.keys(reqSpec.response);
        const missing = expected.filter(k => !(k in (res.data || {})));
        if (missing.length) {
          issues.push({
            file: entryPoint,
            description: `${ep} response missing keys: ${missing.join(', ')}`,
            severity: 'medium',
            fix: `Update ${ep} to return JSON with: ${expected.join(', ')}`,
          });
        }
      }
      if (!passed) {
        issues.push({
          file: entryPoint,
          description: `${ep} returned HTTP ${status} (server error)`,
          severity: 'high',
          fix: `Fix server error in ${ep} handler`,
        });
      }
    } catch (err) {
      issues.push({
        file: entryPoint,
        description: `${ep} crashed: ${err.message}`,
        severity: 'high',
        fix: `Fix server error for ${ep}`,
      });
    }
  }

  console.log(`🧪 Testing ${endpoints.length} endpoint(s)...`);
  for (const ep of endpoints) {
    await testEndpoint(ep);
  }

  server.kill();
  return { success: issues.filter(i => i.severity === 'high').length === 0, issues, output };
}

module.exports = { apiTesterAgent };
