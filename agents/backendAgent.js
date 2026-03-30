const { chatCompletion } = require('../lib/llmRouter');

async function backendAgent(prompt, sharedContext, skillsList = []) {
  if (process.env.MOCK === "true") {
    sharedContext.apiEndpoints = ['/login', '/register', '/refresh', '/reset'];
    return {
      files: [
        { path: 'backend/app/main.py', content: 'from fastapi import FastAPI\napp = FastAPI()\n# jwt bcrypt\n@app.get("/")\ndef read_root(): return {"Hello": "World"}' },
        { path: 'backend/app/routes/auth.py', content: 'from fastapi import APIRouter\n# class users\nrouter = APIRouter()\n@router.post("/login")\ndef login(): return {"token": "mock"}\n@router.post("/register")\ndef reg(): return {"msg": "ok"}\n@router.post("/refresh")\ndef ref(): return {"msg": "ok"}\n@router.post("/reset")\ndef res(): return {"msg": "ok"}\nclass users: pass' }
      ],
      apiEndpoints: ['/login', '/register', '/refresh', '/reset']
    };
  }

  const stack = (sharedContext && sharedContext.stack) ? sharedContext.stack : {
    backend: "FastAPI (Python)",
    frontend: "React (JS + Tailwind)",
    database: "PostgreSQL"
  };
  const systemMessage = `
    You are a senior backend architect using FastAPI (Python).
    Generate only one backend Python file per response.
    Return strict JSON with keys "path" and "content".
    Keep content under 400 lines.
    No markdown or explanations.
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
  let fileObj;
  try {
    fileObj = extractJSON(content);
  } catch (e) {
    const pathMatch = String(prompt).match(/backend\/app\/[a-zA-Z0-9_\/-]+\.py/);
    const inferredPath = pathMatch ? pathMatch[0] : 'backend/app/main.py';
    fileObj = { path: inferredPath, content: content };
  }
  const endpoints = extractEndpoints(fileObj.content || '');
  sharedContext.apiEndpoints = Array.from(new Set([...(sharedContext.apiEndpoints || []), ...endpoints]));
  sharedContext.files = Array.from(new Set([...(sharedContext.files || []), fileObj]));

  return { files: [fileObj], apiEndpoints: endpoints };
}

function extractEndpoints(content) {
  const out = new Set();
  const regex = /@(?:app|router)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    out.add(m[2]);
  }
  return Array.from(out);
}

module.exports = { backendAgent };
