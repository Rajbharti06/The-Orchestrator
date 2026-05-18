/**
 * qaAgent.js - Security audit + contract validation
 *
 * Validates generated code against security rules, API contracts,
 * import validity, and best practices. Returns structured report.
 */

import { callLLM } from '../lib/llmRouter.js';
import { securityScanner } from '../lib/securityScanner.js';
import { qualityGate } from '../lib/qualityGate.js';

const SYSTEM = `You are the QA Auditor Agent for Orchestrator X. Perform a thorough audit of generated code.

Check for:
1. Security: hardcoded secrets, SQL injection, XSS, CORS, JWT issues
2. API Contract: are all required endpoints implemented?
3. Imports: are all imports valid and present?
4. Error handling: do all routes have proper error handling?
5. Authentication: are protected routes actually protected?

Return JSON:
{
  "passed": true|false,
  "score": 0-100,
  "critical": ["issue1", "issue2"],
  "high": ["issue1"],
  "medium": ["issue1"],
  "low": ["issue1"],
  "suggestions": ["improvement1"]
}`;

/**
 * Run the QA agent.
 * @param {Object} files - Generated files { filename: content }
 * @param {Object} architecture - Architecture blueprint
 * @param {Object} [context] - Shared build context
 * @returns {Promise<Object>} QA report
 */
export async function runQA(files, architecture, context = {}) {
  // 1. Static security scan (instant, no LLM)
  const secScan = securityScanner.scanFiles(files);

  // 2. Quality gate checks (instant)
  const gateResult = qualityGate.runQualityGate({
    files,
    contract: { endpoints: architecture.endpoints || [] },
    blockOnHigh: false,
  });

  // 3. LLM-powered deep audit for complex issues
  const filesSummary = Object.entries(files)
    .map(([name, content]) => `=== ${name} ===\n${typeof content === 'string' ? content.slice(0, 1000) : '[binary]'}`)
    .join('\n\n')
    .slice(0, 6000);

  const endpointList = (architecture.endpoints || [])
    .map((e) => `${e.method} ${e.path}`)
    .join('\n');

  let llmAudit = { critical: [], high: [], medium: [], low: [], suggestions: [] };

  try {
    const raw = await callLLM({
      prompt: `Audit this generated code for the requirements below.

REQUIRED ENDPOINTS:
${endpointList}

CODE:
${filesSummary}

Check all required endpoints are implemented. Check for security issues.`,
      system: SYSTEM,
      task: 'qa',
      maxTokens: 1500,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      llmAudit = {
        critical: parsed.critical || [],
        high: parsed.high || [],
        medium: parsed.medium || [],
        low: parsed.low || [],
        suggestions: parsed.suggestions || [],
      };
    }
  } catch {
    // Use static scan results only
  }

  // 4. Merge results
  const allIssues = {
    critical: [
      ...secScan.findings.filter((f) => f.severity === 'critical').map((f) => `${f.title} in ${f.file}:${f.line}`),
      ...llmAudit.critical,
    ],
    high: [
      ...secScan.findings.filter((f) => f.severity === 'high').map((f) => `${f.title} in ${f.file}:${f.line}`),
      ...llmAudit.high,
    ],
    medium: [
      ...secScan.findings.filter((f) => f.severity === 'medium').map((f) => f.title),
      ...llmAudit.medium,
    ],
    low: [
      ...secScan.findings.filter((f) => f.severity === 'low').map((f) => f.title),
      ...llmAudit.low,
    ],
    suggestions: llmAudit.suggestions,
  };

  const score = Math.round(
    Math.max(0, 100
      - allIssues.critical.length * 25
      - allIssues.high.length * 10
      - allIssues.medium.length * 5
      - allIssues.low.length * 2
    )
  );

  const passed = allIssues.critical.length === 0 && allIssues.high.length <= 1 && score >= 60;

  return {
    passed,
    score,
    ...allIssues,
    gateScore: gateResult.score,
    gateChecks: gateResult.checks,
    timestamp: new Date().toISOString(),
  };
}

export default { runQA };
