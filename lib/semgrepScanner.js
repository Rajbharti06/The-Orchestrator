/**
 * semgrepScanner.js - AST-aware security scan via the Semgrep CLI
 *
 * securityScanner.js's regex patterns catch literal string matches fast but
 * can't see dataflow (e.g. a secret passed through two variables before
 * reaching a call site). Semgrep adds real AST/dataflow analysis on top of
 * that, using the OWASP Top Ten ruleset, for defense-in-depth rather than
 * replacement — regex is instant and still useful as a first pass.
 *
 * Requires the `semgrep` CLI on PATH (pip install semgrep / brew install
 * semgrep). If it's missing, scanWithSemgrep() returns an empty result with
 * available: false — callers must not treat that as a passed scan.
 */

import { commandExists, runCommand, writeFilesToTempDir, cleanupTempDir } from './externalTools.js';

const SEMGREP_SEVERITY_MAP = { ERROR: 'high', WARNING: 'medium', INFO: 'low' };

let semgrepAvailable; // cached after first check

/**
 * @returns {Promise<boolean>}
 */
export async function isSemgrepAvailable() {
  if (semgrepAvailable === undefined) semgrepAvailable = await commandExists('semgrep');
  return semgrepAvailable;
}

/**
 * Run Semgrep's OWASP Top Ten ruleset against a set of generated files.
 *
 * @param {Record<string, string>} files - { filename: content }
 * @param {{ config?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ findings: import('./securityScanner.js').Finding[], available: boolean, error: string|null }>}
 */
export async function scanWithSemgrep(files, opts = {}) {
  const config = opts.config ?? 'p/owasp-top-ten';
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const available = await isSemgrepAvailable();
  if (!available) {
    return { findings: [], available: false, error: null };
  }

  let dir;
  try {
    dir = await writeFilesToTempDir(files, 'orchestrator-x-semgrep-');

    const { stdout, stderr, code, timedOut } = await runCommand(
      'semgrep',
      ['scan', `--config=${config}`, '--json', '--quiet', '--disable-version-check', '--no-git-ignore', '.'],
      { cwd: dir, timeoutMs }
    );

    if (timedOut) {
      return { findings: [], available: true, error: `semgrep timed out after ${timeoutMs}ms` };
    }

    if (!stdout.trim()) {
      // Semgrep exits non-zero on findings too — only treat empty stdout as a real error.
      return { findings: [], available: true, error: code !== 0 ? stderr.slice(0, 500) : null };
    }

    const parsed = JSON.parse(stdout);
    const findings = (parsed.results || []).map((r, idx) => mapFinding(r, idx));

    return { findings, available: true, error: null };
  } catch (err) {
    return { findings: [], available: true, error: err.message };
  } finally {
    await cleanupTempDir(dir);
  }
}

/**
 * @param {Object} r - A single semgrep `results[]` entry
 * @param {number} idx
 */
function mapFinding(r, idx) {
  const sevKey = String(r.extra?.severity ?? 'WARNING').toUpperCase();
  const message = r.extra?.message ?? r.check_id ?? 'Semgrep finding';

  return {
    id: `SEMGREP-${idx}`,
    ruleId: r.check_id,
    severity: SEMGREP_SEVERITY_MAP[sevKey] ?? 'medium',
    title: message.slice(0, 120),
    description: message,
    file: r.path ?? 'unknown',
    line: r.start?.line ?? 0,
    snippet: String(r.extra?.lines ?? '').slice(0, 160).replace(/\n/g, ' '),
    fix: r.extra?.fix ?? r.extra?.metadata?.references?.[0] ?? `See Semgrep rule ${r.check_id} for remediation guidance.`,
    source: 'semgrep',
  };
}

export default { isSemgrepAvailable, scanWithSemgrep };
