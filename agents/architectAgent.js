/**
 * architectAgent.js - File structure, API contracts, DB schema design
 *
 * Translates the planner's stack detection into a concrete blueprint.
 * All downstream code agents follow this blueprint exactly.
 */

import { callLLM } from '../lib/llmRouter.js';
import { promptEnhancer } from '../lib/promptEnhancer.js';

const SYSTEM = `You are the Architect Agent for Orchestrator X.

Your job: design the complete technical blueprint for the application based on the build plan.

OUTPUT FORMAT (JSON only, no markdown):
{
  "fileStructure": {
    "backend/main.py": "FastAPI app entry point",
    "backend/models.py": "SQLAlchemy models",
    "backend/auth.py": "JWT authentication",
    "backend/database.py": "DB connection",
    "backend/requirements.txt": "Python dependencies",
    "frontend/src/App.jsx": "React root component",
    "frontend/src/api.js": "API client",
    "frontend/package.json": "Node dependencies",
    ".env.example": "Required environment variables"
  },
  "endpoints": [
    {
      "method": "POST",
      "path": "/api/auth/login",
      "description": "Authenticate user and return JWT",
      "requestBody": {"email": "string", "password": "string"},
      "response": {"token": "string", "user": {"id": "int", "email": "string"}},
      "authRequired": false
    }
  ],
  "dbSchema": [
    {
      "table": "users",
      "columns": [
        {"name": "id", "type": "SERIAL PRIMARY KEY"},
        {"name": "email", "type": "VARCHAR(255) UNIQUE NOT NULL"},
        {"name": "password_hash", "type": "VARCHAR(255) NOT NULL"},
        {"name": "created_at", "type": "TIMESTAMP DEFAULT NOW()"}
      ]
    }
  ],
  "envVars": ["DATABASE_URL", "JWT_SECRET", "PORT"],
  "authStrategy": "JWT with bcrypt password hashing",
  "notes": "Any important architectural decisions"
}

RULES:
1. Return ONLY valid JSON
2. All endpoints must match what the frontend will call
3. Never hardcode secrets — use env vars
4. Include rate limiting notes for auth endpoints
5. Design for production: indexes, constraints, error handling`;

/**
 * Run the architect agent.
 * @param {string} prompt - Original user request
 * @param {Object} plan - From planner agent
 * @param {Object} [context] - Shared build context
 * @returns {Promise<Object>} Architecture blueprint
 */
export async function runArchitect(prompt, plan, context = {}) {
  const stack = plan.stack || {};
  const stackDesc = Object.entries(stack)
    .filter(([, v]) => v && v !== 'none')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const enhanced = promptEnhancer.enhancePrompt(
    `Design the technical architecture for this application:

Original request: ${prompt}

Stack: ${stackDesc}

Complexity: ${plan.complexity || 'medium'}

Design a complete, production-ready architecture with all files, endpoints, and database tables needed.`,
    {
      stack: `${stack.backend}+${stack.frontend}`,
      task: 'planning',
      includeLessons: true,
      includeInstincts: true,
    }
  );

  const raw = await callLLM({
    prompt: enhanced,
    system: SYSTEM,
    task: 'planning',
    maxTokens: 3000,
  });

  return parseArchitecture(raw, plan);
}

/**
 * Parse and validate architecture JSON.
 * @param {string} raw
 * @param {Object} plan
 * @returns {Object}
 */
function parseArchitecture(raw, plan) {
  try {
    const jsonMatch = raw.match(/```(?:json)?\n?([\s\S]*?)```/) || [null, raw];
    const jsonStr = jsonMatch[1];
    const parsed = JSON.parse(jsonStr);

    if (!parsed.endpoints || !parsed.fileStructure) {
      throw new Error('Missing required architecture fields');
    }

    return {
      ...parsed,
      generatedAt: new Date().toISOString(),
      stack: plan.stack,
    };
  } catch {
    return buildDefaultArchitecture(plan);
  }
}

/**
 * Build a default architecture when parsing fails.
 * @param {Object} plan
 * @returns {Object}
 */
function buildDefaultArchitecture(plan) {
  const stack = plan.stack || {};
  const isNode = stack.backend === 'express';
  const isPython = ['fastapi', 'django'].includes(stack.backend);

  const fileStructure = isPython
    ? {
        'backend/main.py': 'FastAPI app entry point',
        'backend/models.py': 'Database models',
        'backend/auth.py': 'JWT authentication',
        'backend/database.py': 'DB connection and session',
        'backend/requirements.txt': 'Python dependencies',
      }
    : {
        'backend/index.js': 'Express app entry point',
        'backend/routes/auth.js': 'Auth routes',
        'backend/middleware/auth.js': 'JWT middleware',
        'backend/models/user.js': 'User model',
        'backend/package.json': 'Node dependencies',
      };

  if (stack.frontend === 'react' || stack.frontend === 'nextjs') {
    Object.assign(fileStructure, {
      'frontend/src/App.jsx': 'React root',
      'frontend/src/components/Login.jsx': 'Login form',
      'frontend/src/api/client.js': 'API client',
      'frontend/package.json': 'Node deps',
    });
  }

  fileStructure['.env.example'] = 'Required environment variables';

  return {
    fileStructure,
    endpoints: [
      { method: 'POST', path: '/api/auth/login', description: 'Authenticate user', authRequired: false },
      { method: 'POST', path: '/api/auth/register', description: 'Register user', authRequired: false },
      { method: 'GET', path: '/api/me', description: 'Get current user', authRequired: true },
      { method: 'GET', path: '/api/health', description: 'Health check', authRequired: false },
    ],
    dbSchema: [
      {
        table: 'users',
        columns: [
          { name: 'id', type: 'SERIAL PRIMARY KEY' },
          { name: 'email', type: 'VARCHAR(255) UNIQUE NOT NULL' },
          { name: 'password_hash', type: 'VARCHAR(255) NOT NULL' },
          { name: 'created_at', type: 'TIMESTAMP DEFAULT NOW()' },
        ],
      },
    ],
    envVars: ['DATABASE_URL', 'JWT_SECRET', 'PORT'],
    authStrategy: 'JWT with bcrypt',
    stack: plan.stack,
    generatedAt: new Date().toISOString(),
    notes: 'Default architecture (parser fallback)',
  };
}

export default { runArchitect };
