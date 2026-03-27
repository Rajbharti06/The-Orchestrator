const { chatCompletion } = require('../lib/llmRouter');

/**
 * Planner Agent
 * Breaks a high-level prompt into structured tasks for other agents.
 */
async function plannerAgent(prompt, sharedContext) {
  if (process.env.MOCK === "true") {
    return {
      tasks: [
        { type: "backend", description: "Create backend/app/main.py (FastAPI app with JWT, bcrypt, PostgreSQL connection)" },
        { type: "backend", description: "Create backend/app/routes/auth.py (POST /register, /login, /refresh, /reset)" },
        { type: "ui", description: "Create frontend/src/App.jsx (React UI with login/register forms)" }
      ],
      requirements: [
        { type: "endpoint", value: "/register", priority: "critical" },
        { type: "endpoint", value: "/login", priority: "critical" },
        { type: "endpoint", value: "/refresh", priority: "high" },
        { type: "endpoint", value: "/reset", priority: "high" },
        { type: "capability", value: "jwt", priority: "critical" },
        { type: "capability", value: "password-hashing", priority: "critical" },
        { type: "schema", value: "users", priority: "high" }
      ]
    };
  }

  const mem = sharedContext && sharedContext.memory ? sharedContext.memory : {};
  const systemMessage = `
    You are a senior software architect and planning expert (StackForge Engine).
    Break the user's high-level app idea into a STACK-SPECIFIC execution plan.
    
    TARGET STACK:
    - Backend: FastAPI (Python)
    - Frontend: React (JSX + Tailwind)
    - Database: PostgreSQL
    
    DOMAIN INTELLIGENCE:
    - If "fintech" or "payment" is mentioned: Include "audit logs", "transaction safety", "rate limiting", and "input validation".
    - If "auth" or "login" is mentioned: Include "JWT", "password hashing", "token refresh", and "secure session".
    - If "chat" or "real-time" is mentioned: Include "WebSocket", "message persistence", and "online status".
    
    STRICT RULES:
    1. Focus on actual CODE implementation. No "setup" or "design" steps.
    2. Backend tasks MUST come first. Define exact file paths and features.
    3. UI tasks must reference the backend endpoints.
    4. Requirements MUST be prioritized:
       - critical: MUST exist for the app to function (e.g. /login, JWT).
       - high: Essential for security or data integrity (e.g. audit logs, hashing).
       - medium: Important features (e.g. /profile, search).
       - low: Optional polish (e.g. dark mode, animations).
    5. Return ONLY a JSON object. No markdown fences.
    
    JSON STRUCTURE:
    {
      "tasks": [
        { "type": "backend", "description": "Create backend/app/main.py with FastAPI initialization and CORS" },
        { "type": "backend", "description": "Create backend/app/routes/auth.py with JWT /login and /register" },
        { "type": "ui", "description": "Create frontend/src/components/LoginForm.jsx calling /api/login" }
      ],
      "requirements": [
        { "type": "endpoint", "value": "/api/login", "priority": "critical", "method": "POST", "requestBody": { "username": "string", "password": "password" }, "response": { "access_token": "string" } },
        { "type": "capability", "value": "jwt", "priority": "critical" }
      ]
    }
  `;

  try {
    const content = await chatCompletion({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt }
      ],
      taskType: 'planning',
      preferredProvider: (sharedContext.providers && sharedContext.providers.planning) || undefined
    });
    
    // Improved JSON cleaning and parsing
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let plan;
    try {
      plan = JSON.parse(cleaned);
    } catch (parseError) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        plan = JSON.parse(match[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''));
      } else {
        throw new Error("Failed to parse AI plan");
      }
    }

    if (!plan.tasks || !Array.isArray(plan.tasks)) {
      throw new Error("Invalid plan format: missing tasks array.");
    }
    return plan;
  } catch (error) {
    console.warn("AI Planner failed, using fallback plan:", error.message);
    return {
      tasks: [
        { type: "backend", description: `Build full FastAPI backend for: ${prompt}` },
        { type: "ui", description: `Build full React UI for: ${prompt}` }
      ],
      requirements: []
    };
  }
}

module.exports = { plannerAgent };
