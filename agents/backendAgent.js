const { chatCompletion } = require('../lib/llmRouter');

async function backendAgent(prompt, sharedContext) {
  if (process.env.MOCK === "true") {
    sharedContext.apiEndpoints = ['/api/login', '/api/register'];
    return {
      files: [
        { path: 'src/mock/backend.js', content: '// Mock backend file' }
      ]
    };
  }

  const systemMessage = `
    You are a senior backend architect.
    Your task is to generate complete, production-ready backend code based on the user's prompt.
    For the prompt "build login system", you must produce a Node.js/Express application with JWT, bcrypt, and PostgreSQL.
    
    IMPORTANT: Return the response ONLY as a JSON object with a "files" array and an "apiEndpoints" array.
    Each object in the "files" array must have "path" and "content" fields.
    The "apiEndpoints" array should list the routes you created.
    Example:
    {
      "files": [
        { "path": "src/app.js", "content": "..." },
        { "path": "src/routes/auth.js", "content": "..." }
      ],
      "apiEndpoints": ["/api/login", "/api/register"]
    }
    Do not include any markdown formatting like \`\`\`json or explanations outside the JSON.
  `;

  const content = await chatCompletion({
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: prompt }
    ],
    model: process.env.MODEL_NAME
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
