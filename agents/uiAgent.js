const { chatCompletion } = require('../lib/llmRouter');

async function uiAgent(prompt, sharedContext) {
  if (process.env.MOCK === "true") {
    return {
      files: [
        { path: 'src/mock/ui.js', content: `// Mock UI file using endpoints: ${sharedContext.apiEndpoints.join(', ')}` }
      ]
    };
  }

  const apiInfo = sharedContext.apiEndpoints ? `The backend API has the following endpoints: ${sharedContext.apiEndpoints.join(', ')}` : 'No backend API endpoints were provided.';

  const systemMessage = `
    You are a senior frontend developer.
    Your task is to generate complete, production-ready frontend code based on the user's prompt.
    ${apiInfo}
    
    IMPORTANT: Return the response ONLY as a JSON object with a "files" array.
    Each object in the "files" array must have "path" and "content" fields.
    Example:
    {
      "files": [
        { "path": "src/App.jsx", "content": "..." },
        { "path": "src/components/Login.jsx", "content": "..." }
      ]
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
      throw new Error('Could not parse ui agent response as JSON');
    }
  }
  return result;
}

module.exports = { uiAgent };
