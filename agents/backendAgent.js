/**
 * backendAgent.js - Backend code generation
 *
 * Generates complete, production-ready backend code following the architect's blueprint.
 * Supports: FastAPI, Express.js, Django, Gin, Spring Boot.
 */

import { callLLM } from '../lib/llmRouter.js';
import { promptEnhancer } from '../lib/promptEnhancer.js';

/**
 * Generate the system prompt based on the backend stack.
 * @param {string} backendStack
 * @returns {string}
 */
function getSystemPrompt(backendStack) {
  const common = `You are the Backend Agent for Orchestrator X. Generate complete, production-ready backend code.

CRITICAL RULES:
1. Generate COMPLETE code — no stubs, no TODOs, no placeholders
2. Every endpoint from the architecture MUST be implemented
3. Use environment variables for ALL secrets (never hardcode)
4. Include proper error handling with meaningful HTTP status codes
5. Include bcrypt for password hashing, never MD5/SHA1
6. JWT tokens must have expiration
7. Add CORS configuration for the frontend
8. Include a /health endpoint always
9. Return file contents as JSON: {"filename": "complete file content"}`;

  const stackGuides = {
    fastapi: `${common}

Stack: FastAPI (Python)
- Use async/await throughout
- Use Pydantic models for request/response validation
- Use SQLAlchemy with async session for database
- Use python-jose for JWT, passlib for bcrypt
- Structure: main.py, models.py, schemas.py, auth.py, database.py, requirements.txt`,

    express: `${common}

Stack: Express.js (Node.js)
- Use ES modules (import/export)
- Use express-validator for input validation
- Use jsonwebtoken for JWT, bcrypt for passwords
- Use pg or better-sqlite3 for database
- Structure: index.js, routes/, middleware/, models/`,

    django: `${common}

Stack: Django REST Framework (Python)
- Use DRF serializers and viewsets
- Use djangorestframework-simplejwt for JWT
- Use Django ORM with migrations
- Structure: urls.py, views.py, serializers.py, models.py, settings.py`,

    gin: `${common}

Stack: Gin (Go)
- Use proper Go error handling
- Use golang-jwt for JWT
- Use GORM for database
- Structure: main.go, handlers/, middleware/, models/`,
  };

  return stackGuides[backendStack] || common;
}

/**
 * Run the backend agent.
 * @param {string} prompt - Original user request
 * @param {Object} plan - From planner agent
 * @param {Object} architecture - From architect agent
 * @param {Object} [context] - Shared build context
 * @returns {Promise<Object>} Generated files { filename: content }
 */
export async function runBackend(prompt, plan, architecture, context = {}) {
  const stack = plan.stack || {};
  const backendStack = stack.backend || 'express';

  const endpointList = (architecture.endpoints || [])
    .map((e) => `${e.method} ${e.path} — ${e.description} (auth: ${e.authRequired ? 'yes' : 'no'})`)
    .join('\n');

  const fileList = Object.entries(architecture.fileStructure || {})
    .filter(([f]) => !f.includes('frontend/') && !f.includes('src/'))
    .map(([f, desc]) => `${f}: ${desc}`)
    .join('\n');

  const enhanced = promptEnhancer.enhancePrompt(
    `Generate complete ${backendStack} backend code for:

REQUEST: ${prompt}

FILES TO CREATE:
${fileList}

ENDPOINTS TO IMPLEMENT:
${endpointList}

DB SCHEMA:
${JSON.stringify(architecture.dbSchema || [], null, 2)}

ENV VARS NEEDED: ${(architecture.envVars || []).join(', ')}

AUTH STRATEGY: ${architecture.authStrategy || 'JWT'}

Return JSON: {"filename": "complete file content", ...}`,
    { stack: backendStack, task: 'coding', includeLessons: true, includeInstincts: true }
  );

  const raw = await callLLM({
    prompt: enhanced,
    system: getSystemPrompt(backendStack),
    task: 'coding',
    maxTokens: 8000,
  });

  return parseFiles(raw, backendStack);
}

/**
 * Parse generated files from LLM output.
 * @param {string} raw
 * @param {string} stack
 * @returns {Object} { filename: content }
 */
function parseFiles(raw, stack) {
  try {
    const jsonMatch = raw.match(/```(?:json)?\n?([\s\S]*?)```/) || [null, raw];
    const jsonStr = jsonMatch[1];
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected object of {filename: content}');
    }

    return parsed;
  } catch {
    // Extract individual code blocks and guess filenames
    const files = {};
    const codeBlocks = raw.matchAll(/```(?:python|javascript|go|java|typescript)?\n([\s\S]*?)```/g);

    const fileNames = stack === 'fastapi'
      ? ['backend/main.py', 'backend/models.py', 'backend/auth.py', 'backend/database.py', 'backend/requirements.txt']
      : ['backend/index.js', 'backend/middleware/auth.js', 'backend/routes/auth.js', 'backend/package.json'];

    let idx = 0;
    for (const block of codeBlocks) {
      const name = fileNames[idx] || `backend/generated-${idx}.${stack === 'fastapi' ? 'py' : 'js'}`;
      files[name] = block[1].trim();
      idx++;
    }

    if (Object.keys(files).length === 0) {
      files[`backend/${stack === 'fastapi' ? 'main.py' : 'index.js'}`] = raw;
    }

    return files;
  }
}

export default { runBackend };
