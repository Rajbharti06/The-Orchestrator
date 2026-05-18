/**
 * fixAgent.js - Targeted issue repair
 *
 * Fixes only what's broken. Never regenerates entire files.
 * Uses lessonStore to avoid repeating known mistakes.
 * Searches for solutions when it encounters unknown errors.
 */

import { callLLM } from '../lib/llmRouter.js';
import { promptEnhancer } from '../lib/promptEnhancer.js';
import { lessonStore } from '../lib/lessonStore.js';

const SYSTEM = `You are the Fix Agent for Orchestrator X. Your job is TARGETED repair of specific issues.

RULES:
1. Fix ONLY the reported issues — don't change working code
2. Return the COMPLETE fixed file content for each file that needs changes
3. Return JSON: {"filename": "complete fixed file content"}
4. If an issue requires a new file, include it
5. Explain each fix briefly in a "fixes" array
6. Never introduce new issues while fixing old ones
7. Use environment variables for secrets if you find hardcoded ones

Return: {"files": {"filename": "content"}, "fixes": ["Fixed X by doing Y"]}`;

/**
 * Run the fix agent.
 * @param {Object} files - Current generated files
 * @param {Object} qaReport - Issues from QA agent
 * @param {Object} plan - Build plan
 * @param {Object} [context] - Shared build context
 * @returns {Promise<{files: Object, fixes: string[], success: boolean}>}
 */
export async function runFix(files, qaReport, plan, context = {}) {
  const stack = plan.stack || {};
  const stackStr = `${stack.backend || 'express'}+${stack.frontend || 'react'}`;

  // Gather all issues
  const allIssues = [
    ...(qaReport.critical || []).map((i) => `[CRITICAL] ${i}`),
    ...(qaReport.high || []).map((i) => `[HIGH] ${i}`),
    ...(qaReport.medium || []).map((i) => `[MEDIUM] ${i}`),
  ];

  if (allIssues.length === 0) {
    return { files, fixes: ['No issues to fix'], success: true };
  }

  // Get relevant lessons to avoid repeated mistakes
  const lessons = lessonStore.getRelevantLessons({ stack: stackStr, limit: 5 });

  // Build file context (relevant files only, limited size)
  const relevantFiles = pickRelevantFiles(files, allIssues);
  const fileContext = Object.entries(relevantFiles)
    .map(([name, content]) => `=== ${name} ===\n${typeof content === 'string' ? content.slice(0, 2000) : ''}`)
    .join('\n\n');

  const lessonContext = lessons.length > 0
    ? `\nKNOWN MISTAKES TO AVOID:\n${lessons.map((l) => `- ${l.issue}: ${l.fix}`).join('\n')}`
    : '';

  const enhanced = promptEnhancer.enhancePrompt(
    `Fix these issues in the generated code:

ISSUES TO FIX:
${allIssues.join('\n')}

CURRENT CODE:
${fileContext}
${lessonContext}

Return JSON with fixed files and list of fixes made.`,
    { stack: stackStr, task: 'coding', includeLessons: true }
  );

  const raw = await callLLM({
    prompt: enhanced,
    system: SYSTEM,
    task: 'coding',
    maxTokens: 6000,
  });

  const result = parseFixResult(raw, files);

  // Learn from any fixes made
  if (result.fixes.length > 0) {
    for (const fix of result.fixes.slice(0, 3)) {
      lessonStore.addLesson({
        issue: `Build issue: ${allIssues[0]?.slice(0, 100)}`,
        cause: 'Code generation error',
        fix,
        stack: stackStr,
        tags: [stack.backend || 'express', 'fix'],
      });
    }
  }

  return result;
}

/**
 * Pick the files most likely relevant to the reported issues.
 * @param {Object} files
 * @param {string[]} issues
 * @returns {Object}
 */
function pickRelevantFiles(files, issues) {
  const issueText = issues.join(' ').toLowerCase();
  const relevant = {};

  for (const [name, content] of Object.entries(files)) {
    const nameLower = name.toLowerCase();
    const isRelevant =
      issueText.includes(nameLower.split('/').pop()) ||
      (issueText.includes('auth') && (nameLower.includes('auth') || nameLower.includes('main'))) ||
      (issueText.includes('sql') && nameLower.includes('model')) ||
      (issueText.includes('cors') && nameLower.includes('main')) ||
      (issueText.includes('import') && true); // Import issues could be anywhere

    if (isRelevant || Object.keys(relevant).length < 3) {
      relevant[name] = content;
    }
  }

  return relevant;
}

/**
 * Parse fix result from LLM output.
 * @param {string} raw
 * @param {Object} originalFiles
 * @returns {{files: Object, fixes: string[], success: boolean}}
 */
function parseFixResult(raw, originalFiles) {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.files && typeof parsed.files === 'object') {
        return {
          files: { ...originalFiles, ...parsed.files },
          fixes: Array.isArray(parsed.fixes) ? parsed.fixes : ['Applied fixes'],
          success: true,
        };
      }
    }
  } catch { /* fall through */ }

  // Try to extract file JSON directly
  try {
    const jsonMatch = raw.match(/```(?:json)?\n?([\s\S]*?)```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (typeof parsed === 'object') {
        return {
          files: { ...originalFiles, ...parsed },
          fixes: ['Applied targeted fixes'],
          success: true,
        };
      }
    }
  } catch { /* fall through */ }

  return {
    files: originalFiles,
    fixes: ['Fix attempt completed (manual review may be needed)'],
    success: false,
  };
}

export default { runFix };
