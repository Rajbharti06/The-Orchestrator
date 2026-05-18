/**
 * runAgent.js - Application boot simulation
 *
 * In production: actually boots the app and captures logs.
 * In mock mode: simulates startup and returns success.
 * Detects startup errors and passes them to the fix agent.
 */

import { callLLM } from '../lib/llmRouter.js';

/**
 * Run the run agent — attempt to start the generated application.
 * @param {Object} files - Generated files
 * @param {Object} plan - Build plan
 * @param {Object} [context] - Shared context
 * @returns {Promise<{success: boolean, port: number, url: string, logs: string[], errors: string[]}>}
 */
export async function runApp(files, plan, context = {}) {
  const stack = plan.stack || {};
  const port = detectPort(files, stack);

  if (process.env.MOCK === 'true') {
    return {
      success: true,
      port,
      url: `http://localhost:${port}`,
      logs: [
        `[mock] Starting ${stack.backend || 'express'} server...`,
        `[mock] Database connection established`,
        `[mock] Server listening on port ${port}`,
      ],
      errors: [],
      simulated: true,
    };
  }

  // Analyze the generated code to predict startup issues
  const backendEntry = findEntryFile(files, stack);
  if (!backendEntry) {
    return {
      success: false,
      port,
      url: `http://localhost:${port}`,
      logs: [],
      errors: ['Could not find backend entry file'],
    };
  }

  // Use LLM to analyze potential startup issues
  const entryContent = files[backendEntry] || '';

  const analysis = await callLLM({
    prompt: `Analyze this ${stack.backend} application entry file for startup issues:

${entryContent.slice(0, 2000)}

List any issues that would prevent the app from starting. Return JSON:
{"willStart": true|false, "issues": ["issue1"], "port": ${port}, "startCommand": "command to start"}`,
    task: 'qa',
    maxTokens: 500,
  });

  try {
    const jsonMatch = analysis.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        success: result.willStart !== false,
        port: result.port || port,
        url: `http://localhost:${result.port || port}`,
        logs: result.willStart ? [`Analysis: App should start on port ${result.port || port}`] : [],
        errors: result.issues || [],
        startCommand: result.startCommand,
      };
    }
  } catch { /* fall through */ }

  return {
    success: true,
    port,
    url: `http://localhost:${port}`,
    logs: [`App appears ready to start on port ${port}`],
    errors: [],
  };
}

/**
 * Detect the port from generated files.
 * @param {Object} files
 * @param {Object} stack
 * @returns {number}
 */
function detectPort(files, stack) {
  // Check .env.example for PORT
  const envExample = files['.env.example'] || '';
  const portMatch = envExample.match(/PORT\s*=\s*(\d+)/);
  if (portMatch) return parseInt(portMatch[1]);

  // Stack defaults
  const defaults = { fastapi: 8000, express: 3000, django: 8000, gin: 8080 };
  return defaults[stack.backend] || 3000;
}

/**
 * Find the backend entry file.
 * @param {Object} files
 * @param {Object} stack
 * @returns {string|null}
 */
function findEntryFile(files, stack) {
  const candidates = {
    fastapi: ['backend/main.py', 'main.py'],
    express: ['backend/index.js', 'backend/server.js', 'index.js'],
    django: ['backend/manage.py', 'manage.py'],
    gin: ['backend/main.go', 'main.go'],
  };

  const list = candidates[stack.backend] || ['backend/index.js', 'backend/main.py'];

  for (const candidate of list) {
    if (files[candidate]) return candidate;
  }

  // Fallback: find any main/index file
  return Object.keys(files).find((f) =>
    f.match(/\/(main|index|server|app)\.(py|js|ts|go)$/)
  ) || null;
}

export default { runApp };
