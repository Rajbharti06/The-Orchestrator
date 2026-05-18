/**
 * reportStore.js - Version-organized build reports
 *
 * Stores and retrieves per-build reports organized by version number.
 * Inspired by openclaw-godmode-skill's reports/vX.X.X/ pattern.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, '..', 'reports');

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Save a report for a specific version and phase.
 * @param {string} version - Semantic version like "2.1.4"
 * @param {string} phase - Phase name: architect, builder, validator, tester, scribe
 * @param {string|Object} content - Report content (string or will be JSON-stringified)
 */
export function saveReport(version, phase, content) {
  const vDir = join(REPORTS_DIR, `v${version}`);
  ensureDir(vDir);

  const phaseOrder = {
    researcher: '00', architect: '01', 'api-guardian': '02',
    builder: '03', validator: '04', tester: '05', scribe: '06',
    planner: '00', qa: '04', fix: '05', run: '06', test: '07',
  };

  const prefix = phaseOrder[phase] || '99';
  const filename = `${prefix}-${phase}-report.md`;
  const filePath = join(vDir, filename);

  const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  writeFileSync(filePath, `# ${phase} Report — v${version}\n\n${body}\n`);
}

/**
 * Get all reports for a version.
 * @param {string} version
 * @returns {Object} { phase: content }
 */
export function getReports(version) {
  const vDir = join(REPORTS_DIR, `v${version}`);
  if (!existsSync(vDir)) return {};

  const reports = {};
  readdirSync(vDir).forEach(file => {
    if (!file.endsWith('.md')) return;
    const phase = file.replace(/^\d+-/, '').replace('-report.md', '');
    try {
      reports[phase] = readFileSync(join(vDir, file), 'utf8');
    } catch { /* skip unreadable files */ }
  });

  return reports;
}

/**
 * List all versioned report directories.
 * @returns {string[]} Sorted version list (newest first)
 */
export function listVersions() {
  if (!existsSync(REPORTS_DIR)) return [];
  return readdirSync(REPORTS_DIR)
    .filter(d => d.match(/^v\d+\.\d+\.\d+$/))
    .sort((a, b) => {
      const [aMaj, aMin, aPatch] = a.slice(1).split('.').map(Number);
      const [bMaj, bMin, bPatch] = b.slice(1).split('.').map(Number);
      if (aMaj !== bMaj) return bMaj - aMaj;
      if (aMin !== bMin) return bMin - aMin;
      return bPatch - aPatch;
    });
}

/**
 * Get the latest version with reports.
 * @returns {string|null}
 */
export function getLatestVersion() {
  const versions = listVersions();
  return versions[0]?.slice(1) || null;
}

/**
 * Save a build summary (full pipeline output) for a version.
 * @param {string} version
 * @param {Object} buildResult
 */
export function saveBuildSummary(version, buildResult) {
  const vDir = join(REPORTS_DIR, `v${version}`);
  ensureDir(vDir);

  const summary = {
    version,
    timestamp: new Date().toISOString(),
    outcome: buildResult.outcome,
    qaScore: buildResult.qaReport?.score,
    testPassRate: buildResult.testResults?.passRate,
    durationMs: buildResult.durationMs,
    fileCount: buildResult.fileCount,
    stack: buildResult.plan?.stack,
  };

  writeFileSync(
    join(vDir, 'build-summary.json'),
    JSON.stringify(summary, null, 2)
  );
}

export default { saveReport, getReports, listVersions, getLatestVersion, saveBuildSummary };
