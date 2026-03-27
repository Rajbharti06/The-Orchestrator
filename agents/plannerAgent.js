const { chatCompletion } = require('../lib/llmRouter');

/**
 * Planner Agent
 * Breaks a high-level prompt into structured tasks for other agents.
 */
async function plannerAgent(prompt) {
  if (process.env.MOCK === "true") {
    return {
      tasks: [
        { type: "backend", description: "Generate Node.js/Express backend authentication system." },
        { type: "ui", description: "Generate React/Tailwind login and registration pages." }
      ]
    };
  }

  const systemMessage = `
    You are a senior software architect and planning expert.
    Your task is to break down a user's high-level app idea into a series of structured tasks for specialized AI agents.
    
    You must identify which tasks should be handled by a "backend" agent and which by a "ui" agent.
    Ensure the tasks are logical and follow a standard software development lifecycle (e.g., backend before frontend).

    IMPORTANT: Return the response ONLY as a JSON object with a "tasks" array.
    Each task object must have "type" (either "backend" or "ui") and "description" fields.
    
    Example:
    {
      "tasks": [
        { "type": "backend", "description": "Build an Express API with JWT auth and a User model." },
        { "type": "ui", "description": "Create a React login form that calls the backend API." }
      ]
    }
    Do not include any markdown formatting or explanations.
  `;

  try {
    const content = await chatCompletion({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt }
      ],
      model: process.env.MODEL_NAME
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
