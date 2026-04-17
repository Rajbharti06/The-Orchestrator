const { chatCompletion } = require('../lib/llmRouter');

async function uiAgent(prompt, sharedContext, skillsList = []) {
  const stack = (sharedContext && sharedContext.stack) || {
    backend: 'FastAPI (Python)',
    frontend: 'React (JSX + Tailwind)',
    database: 'PostgreSQL',
  };

  if (process.env.MOCK === 'true') {
    return {
      files: [
        {
          path: 'frontend/src/App.jsx',
          content: `import React from 'react';\n// API Endpoints: ${(sharedContext.apiEndpoints || []).join(', ')}\nexport default function App() { return <div>App</div>; }`,
        },
      ],
    };
  }

  const apiInfo = sharedContext.apiEndpoints && sharedContext.apiEndpoints.length
    ? `Backend API endpoints: ${sharedContext.apiEndpoints.join(', ')}`
    : 'No backend endpoints known yet.';

  const systemMessage = `
You are a senior frontend developer using ${stack.frontend}.
Generate EXACTLY ONE React file (.jsx or .css) per response.
Use ONLY the provided backend endpoints: ${sharedContext.apiEndpoints ? sharedContext.apiEndpoints.join(', ') : 'none'}.
Return STRICT JSON: { "path": "frontend/src/App.jsx", "content": "..." }
File paths MUST start with "frontend/src/" and MUST use PascalCase for component files (e.g., App.jsx, LoginForm.jsx).
Keep content under 300 lines. No explanations, no markdown outside the JSON.
`.trim();

  const memSummary = sharedContext && sharedContext.memory
    ? `Known recent issues: ${JSON.stringify(sharedContext.memory.lastIssues || [])}`
    : '';
  const { skillsText } = require('../lib/skills');
  const injection = skillsText(skillsList);
  const reqHint = sharedContext && sharedContext.requirements
    ? `Requirements: ${JSON.stringify(sharedContext.requirements)}`
    : '';
  const lessonsBlock = (sharedContext && sharedContext.lessonsBlock) || '';
  const archBlock = (sharedContext && sharedContext.archBlock) || '';

  const content = await chatCompletion({
    messages: [
      { role: 'system', content: [systemMessage, archBlock, lessonsBlock, memSummary, injection, reqHint].filter(Boolean).join('\n') },
      { role: 'user', content: String(prompt) },
    ],
    taskType: 'code',
    preferredProvider: (sharedContext.providers && sharedContext.providers.code) || undefined,
  });

  const { extractJSON } = require('../lib/llmRouter');
  let result;
  try {
    result = extractJSON(content);
  } catch (e) {
    // Fall back to inferring path from prompt
    const pathMatch = String(prompt).match(/frontend\/src\/[A-Za-z0-9_\/-]+\.(jsx|css)/);
    const inferredPath = pathMatch ? pathMatch[0] : 'frontend/src/App.jsx';
    result = { path: inferredPath, content };
  }

  // Normalize: agent might return { files: [...] } or { path, content }
  if (!result.files && result.path && result.content) {
    result = { files: [{ path: result.path, content: result.content }] };
  }
  return result;
}

module.exports = { uiAgent };
