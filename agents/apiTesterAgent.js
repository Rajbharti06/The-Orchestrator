const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function apiTesterAgent(projectDir, sharedContext) {
  const endpoints = sharedContext.apiEndpoints || [];
  if (endpoints.length === 0) {
    return { success: true, message: 'No endpoints to test', issues: [] };
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
      
      for (let ep of endpoints) {
        const req = requirements.find(r => r.type === 'endpoint' && r.value === ep) || {};
        const url = ep.startsWith('http') ? ep : `${baseUrl}${ep.startsWith('/') ? '' : '/'}${ep}`;
        const method = (req.method || 'GET').toUpperCase();
        const testData = req.requestBody || {};

        try {
          console.log(`   - Testing ${method} ${ep}...`);
          let res;
          if (method === 'GET') {
            res = await axios.get(url, { timeout: 2000 });
          } else if (method === 'POST') {
            res = await axios.post(url, testData, { timeout: 2000 });
          } else {
            // Default fallback
            try {
              res = await axios.get(url, { timeout: 2000 });
            } catch (err) {
              if (err.response && err.response.status === 405) {
                res = await axios.post(url, {}, { timeout: 2000 });
              } else throw err;
            }
          }
          
          console.log(`     ✅ ${ep} returned ${res.status}`);
          
          // Schema Validation for Response
          if (req.response) {
            const keys = Object.keys(req.response);
            const missingKeys = keys.filter(k => !(k in res.data));
            if (missingKeys.length > 0) {
              issues.push({
                file: entryPoint,
                description: `API Endpoint ${ep} response missing expected keys: ${missingKeys.join(', ')}`,
                severity: 'medium',
                fix: `Update ${ep} to return a JSON object with: ${keys.join(', ')}`
              });
            }
          }
        } catch (err) {
          const status = err.response ? err.response.status : 'CRASH';
          const errorMsg = err.response ? JSON.stringify(err.response.data) : err.message;
          console.log(`     ❌ ${ep} failed with ${status}`);
          issues.push({
            file: entryPoint,
            description: `API Endpoint ${ep} failed runtime test. Status: ${status}. Error: ${errorMsg}`,
            severity: 'high',
            fix: `Check the implementation of ${ep} in the backend. Ensure it handles requests correctly and doesn't crash.`
          });
        }
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
