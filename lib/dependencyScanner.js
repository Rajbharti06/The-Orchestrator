/**
 * dependencyScanner.js - Supply-chain / SCA scan via the OSV-Scanner CLI
 *
 * Orchestrator X writes its own dependency tree (package.json,
 * requirements.txt, ...) on every build with no human in the loop before
 * npm/pip install runs. That is exactly the "autonomous system picks its own
 * supply chain" risk — this module is the mitigation: scan every generated
 * manifest against the OSV.dev vulnerability database before QA hands off.
 *
 * Requires the `osv-scanner` CLI on PATH (see google/osv-scanner releases).
 * If it's missing, scanDependencies() returns available: false — callers
 * must not treat that as a passed scan.
 */

import { commandExists, runCommand, writeFilesToTempDir, cleanupTempDir } from './externalTools.js';

const MANIFEST_BASENAMES = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'requirements.txt', 'Pipfile.lock', 'poetry.lock',
  'go.mod', 'go.sum',
  'Gemfile.lock',
  'pom.xml', 'build.gradle', 'build.gradle.kts',
  'composer.lock',
  'Cargo.lock',
]);

let osvAvailable; // cached after first check

/**
 * @returns {Promise<boolean>}
 */
export async function isOsvScannerAvailable() {
  if (osvAvailable === undefined) osvAvailable = await commandExists('osv-scanner');
  return osvAvailable;
}

/**
 * @param {Record<string, string>} files
 * @returns {boolean}
 */
function hasManifest(files) {
  return Object.keys(files).some((f) => MANIFEST_BASENAMES.has(f.split(/[\\/]/).pop()));
}

/**
 * Scan generated dependency manifests for known vulnerabilities (OSV.dev).
 *
 * @param {Record<string, string>} files - { filename: content }
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ findings: import('./securityScanner.js').Finding[], available: boolean, skipped: string|null, error: string|null }>}
 */
export async function scanDependencies(files, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 60_000;

  if (!hasManifest(files)) {
    return { findings: [], available: true, skipped: 'no-manifest-files', error: null };
  }

  const available = await isOsvScannerAvailable();
  if (!available) {
    return { findings: [], available: false, skipped: null, error: null };
  }

  let dir;
  try {
    dir = await writeFilesToTempDir(files, 'orchestrator-x-osv-');

    const { stdout, stderr, code, timedOut } = await runCommand(
      'osv-scanner',
      ['--format', 'json', '--recursive', '.'],
      { cwd: dir, timeoutMs }
    );

    if (timedOut) {
      return { findings: [], available: true, skipped: null, error: `osv-scanner timed out after ${timeoutMs}ms` };
    }

    if (!stdout.trim()) {
      // osv-scanner exits 1 when it *finds* vulnerabilities — only codes > 1 are real failures.
      return { findings: [], available: true, skipped: null, error: code > 1 ? stderr.slice(0, 500) : null };
    }

    const parsed = JSON.parse(stdout);
    const findings = extractFindings(parsed);

    return { findings, available: true, skipped: null, error: null };
  } catch (err) {
    return { findings: [], available: true, skipped: null, error: err.message };
  } finally {
    await cleanupTempDir(dir);
  }
}

/**
 * @param {Object} parsed - osv-scanner's `--format json` output
 */
function extractFindings(parsed) {
  const findings = [];

  for (const result of parsed.results ?? []) {
    const source = (result.source?.path ?? 'unknown').replace(/^\.[\\/]/, '');

    for (const pkg of result.packages ?? []) {
      for (const vuln of pkg.vulnerabilities ?? []) {
        findings.push({
          id: `OSV-${vuln.id}`,
          ruleId: vuln.id,
          severity: mapOsvSeverity(vuln),
          title: `${pkg.package.name}@${pkg.package.version}: ${vuln.id}`,
          description: String(vuln.summary ?? vuln.details ?? '').slice(0, 300),
          file: source,
          line: 0,
          snippet: `${pkg.package.name}@${pkg.package.version}`,
          fix: `Upgrade ${pkg.package.name} off the affected range — see https://osv.dev/vulnerability/${vuln.id}`,
          source: 'osv-scanner',
        });
      }
    }
  }

  return findings;
}

/**
 * @param {Object} vuln - A single OSV vulnerability record
 * @returns {'critical'|'high'|'medium'|'low'}
 */
function mapOsvSeverity(vuln) {
  const cvssEntry = vuln.severity?.find((s) => s.type === 'CVSS_V3' || s.type === 'CVSS_V4');
  if (cvssEntry) {
    const score = parseCvssScore(cvssEntry.score);
    if (score !== null) {
      if (score >= 9) return 'critical';
      if (score >= 7) return 'high';
      if (score >= 4) return 'medium';
      return 'low';
    }
  }

  const dbSeverity = String(vuln.database_specific?.severity ?? '').toUpperCase();
  if (dbSeverity === 'CRITICAL') return 'critical';
  if (dbSeverity === 'HIGH') return 'high';
  if (dbSeverity === 'MODERATE' || dbSeverity === 'MEDIUM') return 'medium';
  if (dbSeverity === 'LOW') return 'low';

  // Unknown severity — treat as medium rather than silently dropping a real CVE.
  return 'medium';
}

/**
 * CVSS scores from OSV are either a bare number ("7.5") or a full vector
 * string ("CVSS:3.1/AV:N/.../S:C") with no numeric score inline.
 * @param {string} raw
 * @returns {number|null}
 */
function parseCvssScore(raw) {
  if (!raw) return null;
  const num = parseFloat(raw);
  return Number.isNaN(num) ? null : num;
}

export default { isOsvScannerAvailable, scanDependencies };
