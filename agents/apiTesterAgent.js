const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function apiTesterAgent(projectDir, sharedContext) {
  let endpoints = sharedContext.apiEndpoints || [];
  if (endpoints.length === 0) {
    // Fallback for demo/mock if no endpoints detected
    endpoints = ['/api/login', '/api/register', '/api/refresh', '/api/reset'];
  } else {
    // Ensure /api prefix matches the router wiring in orchestrator.js
    endpoints = endpoints.map(e => e.startsWith('/api') ? e : `/api${e.startsWith('/') ? '' : '/'}${e}`);
  }

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
  const pythonCmd = process.env.PYTHON || 'python';
  const cmd = isPython ? pythonCmd : 'node';
  const args = isPython ? ['-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8000', '--no-access-log'] : [entryPoint];
  
  console.log(`📡 Starting API Test Server: ${cmd} ${args.join(' ')}`);

  return new Promise((resolve) => {
    const server = spawn(cmd, args, {
      cwd: projectDir,
      env: { ...process.env, PORT: '8000' },
      shell: process.platform === 'win32'
    });

    let output = '';
    server.stdout.on('data', (data) => output += data.toString());
    server.stderr.on('data', (data) => output += data.toString());

    const issues = [];
    const baseUrl = 'http://127.0.0.1:8000';

    // Wait for server to start (max 10s)
    let attempts = 0;
    const checkServer = setInterval(async () => {
      attempts++;
      try {
        await axios.get(`${baseUrl}/`, { timeout: 1000 });
        clearInterval(checkServer);
        await runTests();
      } catch (e) {
        if (attempts > 10) {
          clearInterval(checkServer);
          server.kill();
          resolve({
            success: false,
            error: 'Server failed to start within 10s',
            output
          });
        }
      }
    }, 1000);

    async function runTests() {
      console.log(`🧪 Testing ${endpoints.length} endpoints with schema validation...`);
      const requirements = sharedContext.requirements || [];
      const AUTH_ROUTES = ['/login', '/register', '/refresh', '/reset', '/token'];
      async function testEndpoint(ep, req) {
        const url = ep.startsWith('http') ? ep : `${baseUrl}${ep.startsWith('/') ? '' : '/'}${ep}`;
        const isAuth = AUTH_ROUTES.some(r => ep.includes(r));
        const method = (req.method || (isAuth ? 'POST' : 'GET')).toUpperCase();
        const keys = req.requestBody && typeof req.requestBody === 'object' ? Object.keys(req.requestBody) : ['username', 'password'];
        const payload = keys.reduce((acc, k) => { acc[k] = `test_${k}`; return acc; }, {});
        try {
          const res = await axios({
            method,
            url,
            data: method === 'POST' ? payload : undefined,
            timeout: 3000,
            validateStatus: () => true
          });
          const status = res.status;
          const passed = status < 500;
          console.log(`   - ${method} ${ep} → ${status}${passed ? ' (ok)' : ' (fail)'}`);
          if (passed && req.response) {
            const expectedKeys = Object.keys(req.response);
            const missingKeys = expectedKeys.filter(k => !(k in (res.data || {})));
            if (missingKeys.length > 0) {
              issues.push({
                file: entryPoint,
                description: `API Endpoint ${ep} response missing expected keys: ${missingKeys.join(', ')}`,
                severity: 'medium',
                fix: `Update ${ep} to return a JSON object with: ${expectedKeys.join(', ')}`
              });
            }
          }
          if (!passed) {
            issues.push({
              file: entryPoint,
              description: `API Endpoint ${ep} runtime test failed with status ${status}`,
              severity: 'high',
              fix: `Check ${ep} implementation and ensure it handles requests`
            });
          }
        } catch (err) {
          issues.push({
            file: entryPoint,
            description: `API Endpoint ${ep} crashed: ${err.message}`,
            severity: 'high',
            fix: `Fix server error for ${ep}`
          });
        }
      }
      for (let ep of endpoints) {
        const req = requirements.find(r => r.type === 'endpoint' && r.value === ep) || {};
        await testEndpoint(ep, req);
      }

      server.kill();
      resolve({
        success: issues.length === 0,
        issues,
        output
      });
    }

    server.on('error', (err) => {
      clearInterval(checkServer);
      resolve({ success: false, error: `Failed to spawn server: ${err.message}` });
    });

    server.on('exit', (code) => {
      clearInterval(checkServer);
      if (code !== null && code !== 0 && issues.length === 0) {
        resolve({ success: false, error: `Server exited prematurely with code ${code}`, output });
      }
    });
  });
}

module.exports = { apiTesterAgent };
