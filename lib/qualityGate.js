/**
 * qualityGate.js - Build quality verification gate
 *
 * Runs a battery of checks against generated code.
 * Integrates security scanning, import validation, and pattern checks.
 * Returns pass/fail with detailed report. Can block deployment if gate fails.
 */

import { securityScanner } from './securityScanner.js';

/**
 * @typedef {'pass'|'fail'|'warn'} CheckStatus
 * @typedef {{ name: string, status: CheckStatus, message: string, details?: any }} CheckResult
 */

// -----------------------------------------------------------------------
// Individual check functions
// -----------------------------------------------------------------------

/**
 * Check for missing imports or undefined references
 */
function checkImports(files) {
  const issues = [];

  for (const [filename, content] of Object.entries(files)) {
    if (!content || typeof content !== 'string') continue;

    // Python: check for common missing imports
    if (filename.endsWith('.py')) {
      const usesAsyncio = content.includes('async def') || content.includes('await ');
      const hasAsyncioImport = content.includes('import asyncio');
      if (usesAsyncio && !hasAsyncioImport && content.includes('asyncio.')) {
        issues.push(`${filename}: uses asyncio but missing import`);
      }

      const usesFastAPI = content.includes('FastAPI') || content.includes('APIRouter');
      const hasFastAPIImport = content.includes('from fastapi') || content.includes('import fastapi');
      if (usesFastAPI && !hasFastAPIImport) {
        issues.push(`${filename}: uses FastAPI but missing import`);
      }
    }

    // JS/TS: check for common missing imports
    if (filename.match(/\.(js|jsx|ts|tsx)$/)) {
      const usesExpress = content.includes('express()') || content.includes('Router()');
      const hasExpressImport = content.includes("from 'express'") || content.includes('require("express")') || content.includes("require('express')");
      if (usesExpress && !hasExpressImport) {
        issues.push(`${filename}: uses Express but missing import`);
      }

      const usesPrisma = content.includes('prisma.') || content.includes('PrismaClient');
      const hasPrismaImport = content.includes('from "@prisma/client"') || content.includes('PrismaClient');
      if (usesPrisma && !hasPrismaImport) {
        issues.push(`${filename}: uses Prisma but missing import`);
      }
    }
  }

  return {
    name: 'Import Validation',
    status: issues.length > 0 ? 'fail' : 'pass',
    message: issues.length > 0 ? `${issues.length} import issue(s) found` : 'All imports appear valid',
    details: issues,
  };
}

/**
 * Check API contract compliance (do routes match the contract?)
 */
function checkApiContracts(files, contract) {
  if (!contract || !contract.endpoints) {
    return { name: 'API Contract', status: 'pass', message: 'No contract provided, skipping' };
  }

  const issues = [];
  const backendCode = Object.entries(files)
    .filter(([f]) => f.endsWith('.py') || f.endsWith('.js') || f.endsWith('.ts'))
    .map(([, c]) => c)
    .join('\n');

  for (const endpoint of contract.endpoints) {
    const { method, path: routePath } = endpoint;
    const routePattern = routePath.replace(/\{[^}]+\}/g, '[^"\']+');
    const hasRoute =
      new RegExp(`@app\\.${method.toLowerCase()}|router\\.${method.toLowerCase()}|app\\.${method.toLowerCase()}`).test(backendCode) ||
      backendCode.includes(routePath);

    if (!hasRoute) {
      issues.push(`Missing route: ${method} ${routePath}`);
    }
  }

  return {
    name: 'API Contract',
    status: issues.length > 0 ? 'fail' : 'pass',
    message: issues.length > 0 ? `${issues.length} missing route(s)` : 'All routes implemented',
    details: issues,
  };
}

/**
 * Check for error handling completeness
 */
function checkErrorHandling(files) {
  const issues = [];

  for (const [filename, content] of Object.entries(files)) {
    if (!content || typeof content !== 'string') continue;

    if (filename.match(/\.(js|ts)$/) && !filename.includes('test')) {
      // Check async functions have try/catch
      const asyncFunctions = content.match(/async\s+function|async\s*\(|async\s+\w+\s*\(/g) || [];
      const tryCatchCount = (content.match(/try\s*\{/g) || []).length;

      if (asyncFunctions.length > 0 && tryCatchCount === 0) {
        issues.push(`${filename}: has ${asyncFunctions.length} async function(s) but no try/catch`);
      }
    }

    if (filename.endsWith('.py')) {
      // Check if routes have exception handling
      const routes = (content.match(/@app\.(get|post|put|delete|patch)/g) || []).length;
      const tryExcepts = (content.match(/try:/g) || []).length;
      const httpExceptions = (content.match(/HTTPException/g) || []).length;

      if (routes > 0 && tryExcepts === 0 && httpExceptions === 0) {
        issues.push(`${filename}: has ${routes} route(s) but no error handling`);
      }
    }
  }

  return {
    name: 'Error Handling',
    status: issues.length > 0 ? 'warn' : 'pass',
    message: issues.length > 0 ? `${issues.length} file(s) missing error handling` : 'Error handling present',
    details: issues,
  };
}

/**
 * Check environment variable usage
 */
function checkEnvVars(files) {
  const issues = [];
  const definedVars = new Set();

  // Find .env.example or .env for defined vars
  for (const [filename, content] of Object.entries(files)) {
    if (filename.includes('.env') && typeof content === 'string') {
      content.split('\n').forEach((line) => {
        const match = line.match(/^([A-Z_]+)\s*=/);
        if (match) definedVars.add(match[1]);
      });
    }
  }

  if (definedVars.size === 0) return { name: 'Env Vars', status: 'pass', message: 'No .env to validate against' };

  for (const [filename, content] of Object.entries(files)) {
    if (!content || filename.includes('.env') || filename.includes('example')) continue;

    // Find env var usages
    const usedVars = [...content.matchAll(/process\.env\.([A-Z_]+)|os\.environ(?:\.get)?\(["']([A-Z_]+)["']\)/g)]
      .map((m) => m[1] || m[2]);

    for (const varName of usedVars) {
      if (!definedVars.has(varName)) {
        issues.push(`${filename}: uses ${varName} not defined in .env.example`);
      }
    }
  }

  return {
    name: 'Env Vars',
    status: issues.length > 0 ? 'warn' : 'pass',
    message: issues.length > 0 ? `${issues.length} undefined env var(s)` : 'All env vars documented',
    details: issues,
  };
}

/**
 * Check code complexity (basic heuristic)
 */
function checkComplexity(files) {
  const issues = [];

  for (const [filename, content] of Object.entries(files)) {
    if (!content || typeof content !== 'string') continue;
    if (!filename.match(/\.(js|ts|jsx|tsx|py)$/)) continue;

    const lines = content.split('\n');

    // Check for very long files
    if (lines.length > 500) {
      issues.push(`${filename}: ${lines.length} lines — consider splitting into smaller modules`);
    }

    // Check for very long functions (rough heuristic)
    let inFunction = false;
    let functionStart = 0;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^\s*(async\s+)?function\s+\w+|^\s*(async\s+)?\w+\s*\([^)]*\)\s*\{|^\s*(async\s+)?def\s+\w+/)) {
        inFunction = true;
        functionStart = i;
        braceDepth = 0;
      }
      if (inFunction) {
        braceDepth += (lines[i].match(/\{/g) || []).length;
        braceDepth -= (lines[i].match(/\}/g) || []).length;
        if (braceDepth <= 0 && i > functionStart) {
          if (i - functionStart > 60) {
            issues.push(`${filename}:${functionStart + 1}: function is ${i - functionStart} lines (max 60)`);
          }
          inFunction = false;
        }
      }
    }
  }

  return {
    name: 'Code Complexity',
    status: issues.length > 0 ? 'warn' : 'pass',
    message: issues.length > 0 ? `${issues.length} complexity issue(s)` : 'Code complexity within limits',
    details: issues,
  };
}

// -----------------------------------------------------------------------
// Main quality gate function
// -----------------------------------------------------------------------

/**
 * Run all quality checks against a set of files.
 * @param {Object} opts
 * @param {Object} opts.files - { filename: content }
 * @param {Object} [opts.contract] - API contract spec
 * @param {Object} [opts.thresholds] - Custom pass/fail thresholds
 * @param {boolean} [opts.blockOnHigh=true] - Fail gate if high security issues found
 * @returns {{ passed: boolean, score: number, checks: CheckResult[], report: string }}
 */
export function runQualityGate({ files, contract, thresholds = {}, blockOnHigh = true } = {}) {
  const checks = [];

  // 1. Security scan
  const secResult = securityScanner.scanFiles(files);
  checks.push({
    name: 'Security Scan',
    status: secResult.passed ? 'pass' : (secResult.summary.critical > 0 ? 'fail' : 'warn'),
    message: securityScanner.formatReport(secResult).split('\n')[1], // Summary line
    details: secResult.summary,
    security: secResult,
  });

  // 2. Import validation
  checks.push(checkImports(files));

  // 3. API contracts
  checks.push(checkApiContracts(files, contract));

  // 4. Error handling
  checks.push(checkErrorHandling(files));

  // 5. Env vars
  checks.push(checkEnvVars(files));

  // 6. Complexity
  checks.push(checkComplexity(files));

  // Calculate score
  const weights = { pass: 1, warn: 0.7, fail: 0 };
  const totalWeight = checks.length;
  const score = Math.round(
    (checks.reduce((s, c) => s + (weights[c.status] || 0), 0) / totalWeight) * 100
  );

  // Determine pass/fail
  const hasCriticalFail = checks.some((c) => c.status === 'fail');
  const hasSecurityFail = blockOnHigh && !secResult.passed;
  const minScore = thresholds.minScore || 60;
  const passed = !hasCriticalFail && !hasSecurityFail && score >= minScore;

  // Generate report
  const reportLines = [
    `## Quality Gate Report`,
    `**Status**: ${passed ? 'PASSED' : 'FAILED'} | **Score**: ${score}/100`,
    '',
    '| Check | Status | Message |',
    '|-------|--------|---------|',
    ...checks.map((c) => `| ${c.name} | ${c.status.toUpperCase()} | ${c.message} |`),
  ];

  if (!passed) {
    reportLines.push('', '### Issues to Fix:');
    for (const check of checks.filter((c) => c.status === 'fail')) {
      reportLines.push(`- **${check.name}**: ${check.message}`);
      if (check.details && Array.isArray(check.details)) {
        check.details.forEach((d) => reportLines.push(`  - ${d}`));
      }
    }
  }

  return {
    passed,
    score,
    checks,
    report: reportLines.join('\n'),
  };
}

export const qualityGate = { runQualityGate };
export default qualityGate;
