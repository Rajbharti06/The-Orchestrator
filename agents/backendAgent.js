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
    You are a senior backend architect.
    Your task is to generate complete, production-ready backend code using the enforced stack.
    
    ENFORCED STACK:
    - Backend: ${stack.backend}
    - Database: ${stack.database}
    
    HARD RULES:
    - You MUST use FastAPI (Python) for the backend.
    - Do NOT generate Node.js/Express or JavaScript backend files.
    - All backend files MUST be Python (.py). Create clear module structure (e.g., backend/app/main.py, backend/app/routes/*.py).
    - Implement JWT auth, password hashing (bcrypt), and PostgreSQL integration.
    
    IMPORTANT: Return the response ONLY as a JSON object with a "files" array and an "apiEndpoints" array.
    Each object in the "files" array must have "path" and "content" fields (Python files only for backend).
    The "apiEndpoints" array should list the routes you created (e.g., "/api/register", "/api/login", "/api/refresh", "/api/reset").
    Example:
    {
      "files": [
        { "path": "backend/app/main.py", "content": "..." },
        { "path": "backend/app/routes/auth.py", "content": "..." }
      ],
      "apiEndpoints": ["/api/register", "/api/login", "/api/refresh", "/api/reset"]
    }
    Do not include any markdown fences or explanations outside the JSON.
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
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let result;
  try {
    result = JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      result = JSON.parse(match[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''));
    } else {
      throw new Error('Could not parse backend agent response as JSON');
    }
  }
  
  if (result.apiEndpoints) {
    sharedContext.apiEndpoints = result.apiEndpoints;
  }
  sharedContext.files = result.files;

  return result;
}

module.exports = { backendAgent };
