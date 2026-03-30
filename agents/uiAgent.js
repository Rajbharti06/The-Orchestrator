const { chatCompletion } = require('../lib/llmRouter');

async function uiAgent(prompt, sharedContext, skillsList = []) {
  if (process.env.MOCK === "true") {
    return {
      files: [
        { path: 'frontend/src/app.jsx', content: `import React from 'react';\n// API Endpoints: ${sharedContext.apiEndpoints.join(', ')}\nexport default function App() { return <div>StackForge UI</div>; }` }
      ]
    };
  }

  const stack = (sharedContext && sharedContext.stack) ? sharedContext.stack : {
    backend: "FastAPI (Python)",
    frontend: "React (JS + Tailwind)",
    database: "PostgreSQL"
  };
  const apiInfo = sharedContext.apiEndpoints ? `The backend API has the following endpoints: ${sharedContext.apiEndpoints.join(', ')}` : 'No backend API endpoints were provided.';

  const systemMessage = `
    You are a senior frontend developer.
    Generate ONLY ONE React file per response (.jsx or .css).
    Use the provided endpoints: ${sharedContext.apiEndpoints ? sharedContext.apiEndpoints.join(', ') : 'none'}.
    Return STRICT JSON with keys "path" and "content".
    Keep content under 300 lines. No explanations.
  `;

  const memSummary = sharedContext && sharedContext.memory ? `Known recent issues: ${JSON.stringify(sharedContext.memory.lastIssues || [])}` : '';
  const { skillsText } = require('../lib/skills');
  const injection = skillsText(skillsList);
  const reqHint = sharedContext && sharedContext.requirements ? `Requirements: ${JSON.stringify(sharedContext.requirements)}` : '';
  const content = await chatCompletion({
    messages: [
      { role: "system", content: `${systemMessage}\n${memSummary}\n${injection}\n${reqHint}` },
      { role: "user", content: `${prompt}` }
    ],
    model: process.env.MODEL_NAME,
    taskType: 'code',
    preferredProvider: (sharedContext.providers && sharedContext.providers.code) || undefined
  });
  const { extractJSON } = require('../lib/llmRouter');
  let result;
  try {
    result = extractJSON(content);
  } catch (e) {
    const pathMatch = String(prompt).match(/frontend\/src\/[a-zA-Z0-9_\/-]+\.(jsx|css)/);
    const inferredPath = pathMatch ? pathMatch[0] : 'frontend/src/App.jsx';
    result = { files: [{ path: inferredPath, content: content }] };
  }
  if (!result.files && result.path && result.content) {
    result = { files: [{ path: result.path, content: result.content }] };
  }
  return result;
}

module.exports = { uiAgent };
