const { chatCompletion } = require('../lib/llmRouter');

/**
 * Planner Agent
 * Breaks a high-level prompt into structured tasks for other agents.
 */
async function plannerAgent(prompt, sharedContext) {
  if (process.env.MOCK === "true") {
    return {
      tasks: [
        { type: "backend", description: "Generate Node.js/Express backend authentication system." },
        { type: "ui", description: "Generate React/Tailwind login and registration pages." }
      ]
    };
  }

  const mem = sharedContext && sharedContext.memory ? sharedContext.memory : {};
  const systemMessage = `
    You are a senior software architect and planning expert.
    Break the user's high-level app idea into EXECUTABLE coding tasks for specialized agents.
    Only return tasks that directly result in concrete files and runnable code.
    
    STRICT RULES:
    - DO NOT include vague consulting steps like "choose framework" or "design schema".
    - DO include specific file creation and implementation steps (e.g., "create src/app.js with Express server", "create src/routes/auth.js with POST /login").
    - Ensure backend tasks precede UI tasks and align with shared endpoints.
    - Return ONLY JSON with a "tasks" array. No prose, no markdown fences.
    
    Example:
    {
      "tasks": [
        { "type": "backend", "description": "create src/app.js (Express app, JWT, bcrypt, PostgreSQL connection)" },
        { "type": "backend", "description": "create src/routes/auth.js (POST /register, /login, /refresh, /reset)" },
        { "type": "ui", "description": "create src/components/Login.jsx (form calling /login)" }
      ]
    }
    
    Relevant past memory (JSON): ${JSON.stringify(mem)}
  `;

  try {
    const content = await chatCompletion({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt }
      ],
      model: process.env.MODEL_NAME,
      taskType: 'planning',
      preferredProvider: (sharedContext.providers && sharedContext.providers.planning) || undefined
    });
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let plan;
    try {
      plan = JSON.parse(cleaned);
      if (!plan.tasks || !Array.isArray(plan.tasks)) {
        throw new Error("Invalid plan format: missing tasks array.");
      }
      return plan;
    } catch (parseError) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          plan = JSON.parse(match[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''));
          if (!plan.tasks || !Array.isArray(plan.tasks)) {
            throw new Error("Invalid plan format: missing tasks array.");
          }
          return plan;
        } catch (e2) {
          console.error("Failed to parse AI planner response:", e2.message);
        }
      }
      return {
        tasks: [
          { type: "backend", description: `Build the backend for: ${prompt}` },
          { type: "ui", description: `Build the UI for: ${prompt}` }
        ]
      };
    }
  } catch (error) {
    console.error("Error in AI planner agent:", error.message);
    throw error;
  }
}

module.exports = { plannerAgent };
