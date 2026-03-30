const { chatCompletion } = require('../lib/llmRouter');

/**
 * QA Agent
 * Audits the generated codebase for inconsistencies, bugs, and missing dependencies.
 */
async function qaAgent(allFiles, sharedContext) {
  if (process.env.MOCK === "true" || process.env.SKIP_QA === "true") {
    return { hasIssues: false, issues: [], suggestions: "QA skipped." };
  }

  const systemMessage = `
    You are a senior QA engineer and security auditor.
    Your task is to review a set of generated files for a Node.js/React application.
    
    Check for:
    1. Inconsistencies between backend API endpoints and frontend API calls.
    2. Missing imports or broken file paths.
    3. Security vulnerabilities (e.g., hardcoded secrets, weak password hashing).
    4. Logical bugs in the authentication flow.

    IMPORTANT: Return the response ONLY as a JSON object.
    {
      "hasIssues": boolean,
      "issues": [
        { "file": "path/to/file", "description": "...", "severity": "high|medium|low", "fix": "..." }
      ],
      "suggestions": "General feedback..."
    }
    Do not include markdown or explanations outside the JSON.
  `;

  // Prepare file summary for the LLM
  const fileSummary = allFiles.map(f => {
    const firstLines = String(f.content || '').split('\n').slice(0, 20).join('\n');
    return `File: ${f.path}\n${firstLines}\n[truncated]`;
  }).join('\n\n---\n\n');

  try {
    const content = await chatCompletion({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: `Review these files:\n\n${fileSummary}\n\nShared Context: ${JSON.stringify(sharedContext)}` }
      ],
      model: process.env.MODEL_NAME,
      taskType: 'qa',
      preferredProvider: (sharedContext.providers && sharedContext.providers.qa) || undefined
    });
    return JSON.parse(content);
  } catch (error) {
    console.error("Error in QA agent:", error.message);
    throw new Error("QA failed - stopping pipeline");
  }
}

module.exports = { qaAgent };
