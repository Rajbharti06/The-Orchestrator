const { chatCompletion } = require('../lib/llmRouter');

async function backendAgent(prompt, sharedContext, skillsList = []) {
  const stack = (sharedContext && sharedContext.stack) || {
    backend: 'FastAPI (Python)',
    frontend: 'React (JSX + Tailwind)',
    database: 'PostgreSQL',
  };

  if (process.env.MOCK === 'true') {
    sharedContext.apiEndpoints = ['/login', '/register', '/refresh', '/reset'];
    return {
      files: [
        {
          path: 'backend/app/main.py',
          content: 'from fastapi import FastAPI\napp = FastAPI()\n# jwt bcrypt\n@app.get("/")\ndef read_root(): return {"Hello": "World"}',
        },
        {
          path: 'backend/app/routes/auth.py',
          content:
            'from fastapi import APIRouter\nrouter = APIRouter()\n@router.post("/login")\ndef login(): return {"token": "mock"}\n@router.post("/register")\ndef reg(): return {"msg": "ok"}\n@router.post("/refresh")\ndef ref(): return {"msg": "ok"}\n@router.post("/reset")\ndef res(): return {"msg": "ok"}\nclass users: pass',
        },
      ],
      apiEndpoints: ['/login', '/register', '/refresh', '/reset'],
    };
  }

  const systemMessage = `
You are a senior backend architect using ${stack.backend}.
Generate EXACTLY ONE backend file per response.
Return STRICT JSON: { "path": "backend/app/...", "content": "..." }
- File path MUST start with "backend/"
- Content MUST use ${stack.backend} conventions
- Database: ${stack.database}
- Max 400 lines per file
No markdown fences, no text outside the JSON.
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
  const webCtx = (sharedContext && sharedContext.webSearchContext) || '';

  const content = await chatCompletion({
    messages: [
      { role: 'system', content: [systemMessage, archBlock, lessonsBlock, memSummary, injection, reqHint, webCtx].filter(Boolean).join('\n') },
      { role: 'user', content: String(prompt) },
    ],
    taskType: 'code',
    preferredProvider: (sharedContext.providers && sharedContext.providers.code) || undefined,
  });

  const { extractJSON } = require('../lib/llmRouter');
  let fileObj;
  try {
    fileObj = extractJSON(content);
  } catch (e) {
    const pathMatch = String(prompt).match(/backend\/[a-zA-Z0-9_\/./-]+\.py/);
    fileObj = { path: pathMatch ? pathMatch[0] : 'backend/app/main.py', content };
  }

  const endpoints = extractEndpoints(fileObj.content || '');

  // Merge endpoints into context (dedup by value)
  const epSet = new Set([...(sharedContext.apiEndpoints || []), ...endpoints]);
  sharedContext.apiEndpoints = Array.from(epSet);

  // Merge files into context deduped by path (Map guarantees last-write-wins)
  const fileMap = new Map((sharedContext.files || []).map(f => [f.path, f]));
  fileMap.set(fileObj.path, fileObj);
  sharedContext.files = Array.from(fileMap.values());

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
