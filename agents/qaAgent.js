const { chatCompletion } = require('../lib/llmRouter');

/**
 * QA Agent
 * Full-content audit: security, consistency, logic, and schema correctness.
 */
async function qaAgent(allFiles, sharedContext) {
  if (process.env.MOCK === 'true' || process.env.SKIP_QA === 'true') {
    return { hasIssues: false, issues: [], suggestions: 'QA skipped.' };
  }

  const stack = (sharedContext && sharedContext.stack) || {};
  const systemMessage = `
You are a senior QA engineer, security auditor, and code reviewer.
Audit the provided source files for a ${stack.backend || 'FastAPI'} + ${stack.frontend || 'React'} application.

Check for ALL of the following:
1. Backend/frontend endpoint mismatches (path, method, or payload shape).
2. Missing imports, undefined variables, or broken file paths.
3. Security vulnerabilities: hardcoded secrets, weak hashing, unvalidated inputs, CORS wildcards.
4. Logic bugs: incorrect JWT flows, missing error handling, wrong status codes.
5. Schema mismatches between SQLAlchemy models and API response schemas.
6. Missing required dependencies (imports used but never installed/imported).

Severity scale:
- critical: breaks the app entirely
- high: security issue or missing core feature
- medium: inconsistency or suboptimal practice
- low: code style or minor improvement

Return ONLY a JSON object:
{
  "hasIssues": boolean,
  "issues": [
    { "file": "path/to/file", "line": <number or null>, "description": "...", "severity": "critical|high|medium|low", "fix": "..." }
  ],
  "suggestions": "General feedback..."
}
No markdown fences, no text outside the JSON.
`;

  // Include FULL content (not truncated) — the key upgrade
  const fileSummary = allFiles
    .map(f => `=== FILE: ${f.path} ===\n${String(f.content || '')}`)
    .join('\n\n');

  try {
    const content = await chatCompletion({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: `Files to audit:\n\n${fileSummary}\n\nShared context: ${JSON.stringify({ stack, requirements: sharedContext.requirements })}` },
      ],
      taskType: 'qa',
      preferredProvider: (sharedContext.providers && sharedContext.providers.qa) || undefined,
    });
    const { extractJSON } = require('../lib/llmRouter');
    return extractJSON(content);
  } catch (error) {
    console.error('Error in QA agent:', error.message);
    throw new Error('QA failed — stopping pipeline');
  }
}

module.exports = { qaAgent };
