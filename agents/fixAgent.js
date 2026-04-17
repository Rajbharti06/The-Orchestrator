const { chatCompletion } = require('../lib/llmRouter');

/**
 * Fix Agent
 * Receives a QA/runtime report and surgically rewrites only the affected files.
 */
async function fixAgent(allFiles, qaResult, sharedContext) {
  if (process.env.MOCK === 'true') return allFiles;

  const stack = (sharedContext && sharedContext.stack) || {};
  const issues = qaResult.issues || [];

  // Build a focused view: only include files that have issues
  const affectedPaths = new Set(issues.map(i => i.file).filter(Boolean));
  const affectedFiles = affectedPaths.size
    ? allFiles.filter(f => affectedPaths.has(f.path))
    : allFiles; // if no specific file, send all

  const systemMessage = `
You are a senior debugging engineer.
Fix ONLY the specific issues listed in the QA report below.
Do NOT rewrite files that are not affected.

Target stack: ${stack.backend || 'FastAPI'} + ${stack.frontend || 'React'}

Rules:
1. Return ONLY a JSON object: { "files": [{ "path": "...", "content": "..." }, ...] }
2. Include ONLY the files you changed.
3. Preserve existing logic that is not broken.
4. Each fix must directly address the described issue.
5. No markdown, no prose outside the JSON.
`.trim();

  const fileSummary = affectedFiles
    .map(f => `=== ${f.path} ===\n${String(f.content || '')}`)
    .join('\n\n');

  const issueList = issues.map((i, idx) =>
    `${idx + 1}. [${i.severity?.toUpperCase() || 'HIGH'}] ${i.file || 'unknown'}: ${i.description}\n   Fix: ${i.fix || 'Fix the issue'}`
  ).join('\n');

  try {
    const content = await chatCompletion({
      messages: [
        { role: 'system', content: systemMessage },
        {
          role: 'user',
          content: `Files to fix:\n\n${fileSummary}\n\nIssues to resolve:\n${issueList}\n\nShared context: ${JSON.stringify({ stack, requirements: sharedContext.requirements })}`,
        },
      ],
      taskType: 'fix',
      preferredProvider: (sharedContext.providers && sharedContext.providers.fix) || undefined,
    });

    const { extractJSON } = require('../lib/llmRouter');
    const parsed = extractJSON(content);
    const updatedFiles = parsed.files || [];

    // Merge: updated files override originals, unaffected files keep their content
    const fileMap = new Map(allFiles.map(f => [f.path, f]));
    for (const uf of updatedFiles) {
      fileMap.set(uf.path, uf);
    }
    return Array.from(fileMap.values());
  } catch (error) {
    console.error('Fix agent error:', error.message);
    return allFiles; // fail-safe: return unchanged
  }
}

module.exports = { fixAgent };
