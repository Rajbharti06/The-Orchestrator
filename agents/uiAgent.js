const { chatCompletion } = require('../lib/llmRouter');

async function uiAgent(prompt, sharedContext, skillsList = []) {
  if (process.env.MOCK === "true") {
    return {
      files: [
        { path: 'src/mock/ui.js', content: `// Mock UI file using endpoints: ${sharedContext.apiEndpoints.join(', ')}` }
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
    Your task is to generate complete, production-ready frontend code using the enforced stack.
    ${apiInfo}
    
    ENFORCED STACK:
    - Frontend: ${stack.frontend}
    
    HARD RULES:
    - You MUST use React with JSX. Do NOT use Vue or Angular.
    - Use Tailwind CSS for styling.
    - All frontend component files MUST be .jsx (e.g., frontend/src/components/Login.jsx).
    - Ensure the frontend calls the provided backend endpoints.
    
    IMPORTANT: Return the response ONLY as a JSON object with a "files" array.
    Each object in the "files" array must have "path" and "content" fields (React .jsx and CSS files only for frontend).
    Example:
    {
      "files": [
        { "path": "frontend/src/App.jsx", "content": "..." },
        { "path": "frontend/src/components/Login.jsx", "content": "..." }
      ]
    }
    Do not include any markdown formatting like \`\`\`json or explanations outside the JSON.
  `;

  const skillsText = skillsList.length ? `Use skills: ${skillsList.join(', ')}` : '';
  const memSummary = sharedContext && sharedContext.memory ? `Known recent issues: ${JSON.stringify(sharedContext.memory.lastIssues || [])}` : '';
  const { skillsText } = require('../lib/skills');
  const injection = skillsText(skillsList);
  const content = await chatCompletion({
    messages: [
      { role: "system", content: `${systemMessage}\n${memSummary}\n${injection}` },
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
      throw new Error('Could not parse ui agent response as JSON');
    }
  }
  return result;
}

module.exports = { uiAgent };
