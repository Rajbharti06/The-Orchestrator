const { chatCompletion } = require('../lib/llmRouter');

/**
 * Planner Agent
 * Detects the optimal stack from the prompt and breaks into structured tasks.
 */

function detectStack(prompt, envOverrides) {
  if (envOverrides && envOverrides.backend && envOverrides.frontend) {
    return envOverrides;
  }
  const p = (prompt || '').toLowerCase();

  let backend = 'FastAPI (Python)';
  let frontend = 'React (JSX + Tailwind)';
  let database = 'PostgreSQL';

  if (/\bdjango\b/.test(p)) backend = 'Django (Python)';
  else if (/\bexpress\b|\bnode\.?js backend\b/.test(p)) backend = 'Express (Node.js)';
  else if (/\bnestjs\b|\bnest\.js\b/.test(p)) backend = 'NestJS (TypeScript)';
  else if (/\brails\b|\bruby on rails\b/.test(p)) backend = 'Ruby on Rails';

  if (/\bnext\.?js\b/.test(p)) frontend = 'Next.js (React + Tailwind)';
  else if (/\bvue\b/.test(p)) frontend = 'Vue 3 (Composition API)';
  else if (/\bsvelte\b/.test(p)) frontend = 'Svelte';
  else if (/\bangular\b/.test(p)) frontend = 'Angular';

  if (/\bmysql\b/.test(p)) database = 'MySQL';
  else if (/\bmongodb\b|\bmongo\b/.test(p)) database = 'MongoDB';
  else if (/\bsqlite\b/.test(p)) database = 'SQLite';
  else if (/\bredis\b/.test(p)) database = 'Redis';

  // Env overrides take precedence per-component
  if (process.env.STACK_BACKEND) backend = process.env.STACK_BACKEND;
  if (process.env.STACK_FRONTEND) frontend = process.env.STACK_FRONTEND;
  if (process.env.STACK_DB) database = process.env.STACK_DB;

  return { backend, frontend, database };
}

async function plannerAgent(prompt, sharedContext) {
  // Detect or use provided stack
  const detectedStack = detectStack(prompt, sharedContext && sharedContext.stack);
  if (sharedContext) sharedContext.stack = detectedStack;

  if (process.env.MOCK === 'true') {
    return {
      stack: detectedStack,
      tasks: [
        { type: 'backend', description: 'Create backend/app/main.py (FastAPI app with JWT, bcrypt, PostgreSQL connection)' },
        { type: 'backend', description: 'Create backend/app/routes/auth.py (POST /register, /login, /refresh, /reset)' },
        { type: 'ui', description: 'Create frontend/src/App.jsx (React UI with login/register forms)' },
      ],
      requirements: [
        { type: 'endpoint', value: '/register', priority: 'critical' },
        { type: 'endpoint', value: '/login', priority: 'critical' },
        { type: 'endpoint', value: '/refresh', priority: 'high' },
        { type: 'endpoint', value: '/reset', priority: 'high' },
        { type: 'capability', value: 'jwt', priority: 'critical' },
        { type: 'capability', value: 'password-hashing', priority: 'critical' },
        { type: 'schema', value: 'users', priority: 'high' },
      ],
    };
  }

  const mem = sharedContext && sharedContext.memory ? sharedContext.memory : {};
  const stack = detectedStack;

  const systemMessage = `
You are a senior software architect.
Detect the app domain from the user prompt and produce a STACK-SPECIFIC execution plan.

TARGET STACK (auto-detected or user-specified):
- Backend: ${stack.backend}
- Frontend: ${stack.frontend}
- Database: ${stack.database}

DOMAIN INTELLIGENCE:
- auth/login/register/password → JWT, password hashing, token refresh, secure sessions
- chat/realtime/messaging → WebSocket, message persistence, online presence
- fintech/payment/transaction → audit logs, transaction safety, rate limiting, input validation
- ecommerce/store/cart/checkout → products, cart, orders, payment integration
- blog/cms/content → CRUD posts, categories, tags, rich text editor
- social/follow/profile → user graph, feed, notifications
- saas/dashboard/analytics → multi-tenant, billing, metrics, charts
- ai/ml/predict → model inference endpoint, async jobs, streaming results

STRICT RULES:
1. Focus on CODE implementation. No "setup" or "design" steps.
2. Backend tasks MUST come first and be independent (each generates one file).
3. UI tasks must reference exact backend endpoint paths.
4. Each task generates EXACTLY ONE file.
5. Requirements MUST be prioritized: critical / high / medium / low.
6. Return ONLY a JSON object — no markdown, no prose.

JSON STRUCTURE:
{
  "stack": { "backend": "...", "frontend": "...", "database": "..." },
  "tasks": [
    { "type": "backend", "description": "Create backend/app/main.py with FastAPI init, CORS, and DB connection" },
    { "type": "backend", "description": "Create backend/app/routes/auth.py with POST /register, /login, /refresh using JWT" },
    { "type": "ui", "description": "Create frontend/src/App.jsx with login and register forms calling /api/login and /api/register" }
  ],
  "requirements": [
    { "type": "endpoint", "value": "/api/login", "priority": "critical", "method": "POST",
      "requestBody": { "username": "string", "password": "string" },
      "response": { "access_token": "string" } },
    { "type": "capability", "value": "jwt", "priority": "critical" }
  ]
}
`;

  try {
    const content = await chatCompletion({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      taskType: 'planning',
      preferredProvider: 'groq',
    });
    const { extractJSON } = require('../lib/llmRouter');
    const plan = extractJSON(content);

    if (!plan.tasks || !Array.isArray(plan.tasks)) {
      throw new Error('Invalid plan format: missing tasks array.');
    }
    // Apply detected stack to shared context even if LLM overrode it
    if (plan.stack && sharedContext) {
      sharedContext.stack = { ...detectedStack, ...plan.stack };
    }
    return plan;
  } catch (error) {
    console.warn('AI Planner failed, using fallback plan:', error.message);
    return {
      isFallback: true,
      stack: detectedStack,
      tasks: [
        { type: 'backend', description: 'Create backend/app/main.py with FastAPI initialization and CORS' },
        { type: 'backend', description: 'Create backend/app/routes/auth.py with JWT /login and /register' },
        { type: 'ui', description: 'Create frontend/src/App.jsx calling /api/login and /api/register' },
      ],
      requirements: [
        { type: 'endpoint', value: '/api/login', priority: 'critical', method: 'POST',
          requestBody: { username: 'string', password: 'string' }, response: { access_token: 'string' } },
        { type: 'endpoint', value: '/api/register', priority: 'critical', method: 'POST',
          requestBody: { username: 'string', password: 'string' }, response: { id: 'string' } },
        { type: 'capability', value: 'jwt', priority: 'critical' },
        { type: 'capability', value: 'password-hashing', priority: 'high' },
      ],
    };
  }
}

module.exports = { plannerAgent, detectStack };
