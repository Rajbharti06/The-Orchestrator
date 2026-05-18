/**
 * webSearchAgent.js - Runtime error search and solution finding
 *
 * Searches for solutions to unknown errors that the fix agent can't resolve.
 * Uses LLM to synthesize search results into actionable fixes.
 */

import { callLLM } from '../lib/llmRouter.js';

/**
 * Search for solutions to a runtime error.
 * @param {string} error - The error message or stack trace
 * @param {Object} context - { stack, files }
 * @returns {Promise<{solution: string, source: string, confidence: number}>}
 */
export async function searchForSolution(error, context = {}) {
  const stack = context.stack || {};
  const stackStr = `${stack.backend || 'node'} ${stack.frontend || ''}`.trim();

  if (process.env.MOCK === 'true') {
    return {
      solution: `For ${error.slice(0, 50)}: ensure all dependencies are installed and environment variables are set.`,
      source: 'mock',
      confidence: 0.7,
    };
  }

  const prompt = `You are a senior software engineer helping debug a build error.

Error: ${error}
Stack: ${stackStr}

Based on your knowledge of ${stackStr} development:
1. What is the most likely cause of this error?
2. What is the exact fix?
3. Are there any common pitfalls to avoid?

Return JSON:
{
  "cause": "likely cause",
  "solution": "exact steps to fix",
  "codeChange": "specific code change if applicable",
  "confidence": 0.0-1.0
}`;

  const raw = await callLLM({ prompt, task: 'qa', maxTokens: 800 });

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        solution: `${result.cause ? `Cause: ${result.cause}. ` : ''}Fix: ${result.solution}${result.codeChange ? `\n\nCode change: ${result.codeChange}` : ''}`,
        source: 'llm-knowledge',
        confidence: result.confidence || 0.75,
      };
    }
  } catch { /* fall through */ }

  return {
    solution: raw.slice(0, 500),
    source: 'llm-knowledge',
    confidence: 0.5,
  };
}

/**
 * Analyze multiple errors and return prioritized solutions.
 * @param {string[]} errors
 * @param {Object} context
 * @returns {Promise<Object[]>}
 */
export async function analyzeErrors(errors, context = {}) {
  const solutions = [];

  for (const error of errors.slice(0, 3)) { // Limit to top 3 errors
    const solution = await searchForSolution(error, context);
    solutions.push({ error, ...solution });
  }

  return solutions.sort((a, b) => b.confidence - a.confidence);
}

export default { searchForSolution, analyzeErrors };
