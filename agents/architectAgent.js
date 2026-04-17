/**
 * Architect Agent — Design Before Code
 *
 * Separates system design from implementation. The architect thinks at a high level
 * — file structure, API contracts, schemas, security requirements — and produces
 * a structured spec. Every downstream agent (backend, UI, QA) receives this spec
 * so they all build toward the same blueprint instead of making independent guesses.
 *
 * Flow:
 *   1. Receives prompt + stack + lessons → returns structured spec
 *   2. Spec injected into backend/ui agent prompts as shared context
 */

const { chatCompletion, extractJSON } = require('../lib/llmRouter');
const { getRelevantLessons, formatLessonsForPrompt } = require('../lib/lessonStore');
const { getSkillsForPrompt, formatSkillsBlock } = require('../lib/skills');

async function architectAgent(prompt, stack = {}, options = {}) {
  const lessons = getRelevantLessons(prompt);
  const lessonsBlock = formatLessonsForPrompt(lessons);
  const skills = getSkillsForPrompt(prompt);
  const skillsBlock = formatSkillsBlock(skills);

  const systemMsg = `
You are a senior software architect. Your job is to design the complete system architecture
BEFORE any code is written. The coding agents will use your spec as a blueprint.

${lessonsBlock}
${skillsBlock}

Return ONLY valid JSON with this exact structure:
{
  "overview": "1-2 sentence description of what is being built",
  "stack": {
    "backend": "FastAPI (Python) | Express (Node) | Django | NestJS",
    "frontend": "React (JSX + Tailwind) | Next.js | Vue | Svelte",
    "database": "PostgreSQL | MongoDB | SQLite | MySQL | Redis",
    "extras": ["websocket", "jwt", "stripe", "etc"]
  },
  "files": [
    {
      "path": "backend/app/main.py",
      "purpose": "FastAPI entry point with lifespan, CORS, routers",
      "type": "backend",
      "critical": true
    }
  ],
  "api_contracts": [
    {
      "method": "POST",
      "path": "/api/v1/login",
      "request": "{ email: string, password: string }",
      "response": "{ access_token: string, refresh_token: string }",
      "auth": false
    }
  ],
  "schemas": [
    {
      "name": "users",
      "fields": "id, email, password_hash, created_at"
    }
  ],
  "architecture_decisions": [
    "Use JWT with RS256 — rotate keys via env on deploy",
    "Separate concerns: routes, models, services each in own directory"
  ],
  "security_requirements": [
    "Hash passwords with bcrypt cost 12+",
    "Rate-limit /login to 10 req/min per IP"
  ],
  "dependencies": {
    "backend": ["fastapi", "uvicorn", "sqlalchemy"],
    "frontend": ["react", "axios", "tailwindcss"]
  }
}
`.trim();

  const userMsg = `
Design the complete architecture for:
"${prompt}"

Stack detected: ${JSON.stringify(stack)}
`.trim();

  try {
    const content = await chatCompletion({
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      taskType: 'planning',
    });

    const spec = extractJSON(content);
    if (!spec || !spec.files) throw new Error('Invalid spec returned');

    // Merge detected stack into spec if LLM didn't fill it
    if (!spec.stack) spec.stack = stack;
    if (!spec.stack.backend && stack.backend) spec.stack.backend = stack.backend;
    if (!spec.stack.frontend && stack.frontend) spec.stack.frontend = stack.frontend;
    if (!spec.stack.database && stack.database) spec.stack.database = stack.database;

    return spec;
  } catch (err) {
    // Fallback: minimal spec so pipeline can still proceed
    const backendFile = inferBackendEntry(stack);
    const frontendFile = inferFrontendEntry(stack);
    return {
      overview: prompt.substring(0, 120),
      stack,
      files: [
        { path: backendFile, purpose: 'Backend entry point', type: 'backend', critical: true },
        { path: frontendFile, purpose: 'Frontend entry point', type: 'ui', critical: true },
      ],
      api_contracts: [],
      schemas: [],
      architecture_decisions: [],
      security_requirements: [],
      dependencies: {},
      _fallback: true,
      _error: err.message,
    };
  }
}

function inferBackendEntry(stack) {
  const b = (stack.backend || '').toLowerCase();
  if (b.includes('django')) return 'backend/manage.py';
  if (b.includes('express') || b.includes('node')) return 'backend/src/app.js';
  if (b.includes('nest')) return 'backend/src/main.ts';
  return 'backend/app/main.py';
}

function inferFrontendEntry(stack) {
  const f = (stack.frontend || '').toLowerCase();
  if (f.includes('next')) return 'frontend/pages/index.js';
  if (f.includes('vue')) return 'frontend/src/App.vue';
  if (f.includes('svelte')) return 'frontend/src/App.svelte';
  return 'frontend/src/App.jsx';
}

/**
 * Format architect spec as a block to inject into backend/ui agent prompts.
 * Gives coding agents full context from the architect's design.
 */
function formatSpecForPrompt(spec) {
  if (!spec) return '';
  const lines = [];
  if (spec.overview) lines.push(`Project: ${spec.overview}`);
  if (spec.stack) {
    lines.push(`Stack: ${spec.stack.backend} + ${spec.stack.frontend} + ${spec.stack.database}`);
    if (spec.stack.extras?.length) lines.push(`Extras: ${spec.stack.extras.join(', ')}`);
  }
  if (spec.api_contracts?.length) {
    lines.push('\nAPI Contracts:');
    spec.api_contracts.forEach(c => {
      lines.push(`  ${c.method} ${c.path} → req: ${c.request} | res: ${c.response}`);
    });
  }
  if (spec.schemas?.length) {
    lines.push('\nSchemas:');
    spec.schemas.forEach(s => lines.push(`  ${s.name}: ${s.fields}`));
  }
  if (spec.architecture_decisions?.length) {
    lines.push('\nArchitecture decisions:');
    spec.architecture_decisions.forEach(d => lines.push(`  • ${d}`));
  }
  if (spec.security_requirements?.length) {
    lines.push('\nSecurity requirements:');
    spec.security_requirements.forEach(r => lines.push(`  • ${r}`));
  }
  return `\n📐 ARCHITECT SPEC — follow this design exactly:\n${lines.join('\n')}\n`;
}

module.exports = { architectAgent, formatSpecForPrompt };
