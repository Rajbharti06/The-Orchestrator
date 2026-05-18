/**
 * uiAgent.js - Frontend code generation
 *
 * Generates complete React/Vue/Next.js frontend that calls EXACT API endpoints
 * defined in the architecture. Never uses placeholder URLs.
 */

import { callLLM } from '../lib/llmRouter.js';
import { promptEnhancer } from '../lib/promptEnhancer.js';

const SYSTEM = `You are the UI Agent for Orchestrator X. Generate complete, production-ready frontend code.

CRITICAL RULES:
1. Generate COMPLETE code — no stubs, no TODOs
2. Use EXACT API endpoints from the architecture (no placeholders)
3. API base URL must come from environment: process.env.REACT_APP_API_URL || 'http://localhost:8000'
4. Include proper loading states, error handling in all forms
5. Store JWT token in localStorage with 'token' key
6. Include auth-protected routes using React Router
7. Use CSS modules or Tailwind for styling (minimal, clean)
8. Include a simple API client that adds Authorization: Bearer header
9. Return file contents as JSON: {"filename": "complete file content"}

COMPONENT STRUCTURE:
- App.jsx: routing, auth context
- components/Login.jsx: login form
- components/Register.jsx: registration form
- api/client.js: axios or fetch wrapper with auth header
- All screens for the main feature`;

/**
 * Run the UI agent.
 * @param {string} prompt - Original user request
 * @param {Object} plan - From planner agent
 * @param {Object} architecture - From architect agent
 * @param {Object} [context] - Shared build context
 * @returns {Promise<Object>} Generated files { filename: content }
 */
export async function runUI(prompt, plan, architecture, context = {}) {
  const stack = plan.stack || {};
  const frontendStack = stack.frontend || 'react';

  const endpointList = (architecture.endpoints || [])
    .map((e) => `${e.method} ${e.path} — ${e.description}`)
    .join('\n');

  const fileList = Object.entries(architecture.fileStructure || {})
    .filter(([f]) => f.includes('frontend/') || f.includes('src/'))
    .map(([f, desc]) => `${f}: ${desc}`)
    .join('\n');

  const enhanced = promptEnhancer.enhancePrompt(
    `Generate complete ${frontendStack} frontend code for:

REQUEST: ${prompt}

FILES TO CREATE:
${fileList}

API ENDPOINTS TO CALL:
${endpointList}

AUTH STRATEGY: ${architecture.authStrategy || 'JWT'}

The frontend must call these EXACT endpoints. No placeholder URLs.
Return JSON: {"filename": "complete file content", ...}`,
    { stack: frontendStack, task: 'coding', includeLessons: true, includeInstincts: true }
  );

  const raw = await callLLM({
    prompt: enhanced,
    system: SYSTEM,
    task: 'coding',
    maxTokens: 6000,
  });

  return parseFiles(raw, frontendStack);
}

/**
 * Parse generated files from LLM output.
 * @param {string} raw
 * @param {string} stack
 * @returns {Object}
 */
function parseFiles(raw, stack) {
  try {
    const jsonMatch = raw.match(/```(?:json)?\n?([\s\S]*?)```/) || [null, raw];
    const jsonStr = jsonMatch[1];
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== 'object') throw new Error('Not an object');
    return parsed;
  } catch {
    const files = {};
    const codeBlocks = raw.matchAll(/```(?:jsx?|tsx?|javascript|typescript|html|css)?\n([\s\S]*?)```/g);

    const fileNames = [
      'frontend/src/App.jsx',
      'frontend/src/components/Login.jsx',
      'frontend/src/components/Register.jsx',
      'frontend/src/api/client.js',
      'frontend/src/styles/App.css',
      'frontend/package.json',
    ];

    let idx = 0;
    for (const block of codeBlocks) {
      const name = fileNames[idx] || `frontend/src/component-${idx}.jsx`;
      files[name] = block[1].trim();
      idx++;
    }

    if (Object.keys(files).length === 0) {
      files['frontend/src/App.jsx'] = raw;
    }

    return files;
  }
}

export default { runUI };
