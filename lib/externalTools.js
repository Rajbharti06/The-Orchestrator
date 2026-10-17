/**
 * externalTools.js - Shared helpers for shelling out to external CLI scanners
 *
 * Used by semgrepScanner.js and dependencyScanner.js to materialize generated
 * files on disk, invoke a CLI tool, and clean up — without ever trusting an
 * LLM-generated filename enough to let it write outside the scratch directory.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const availabilityCache = new Map();

/**
 * Check whether a CLI command is on PATH. Result is cached for the process
 * lifetime so repeated scans don't re-shell out just to check availability.
 * @param {string} cmd
 * @returns {Promise<boolean>}
 */
export async function commandExists(cmd) {
  if (availabilityCache.has(cmd)) return availabilityCache.get(cmd);

  // `where.exe` / `which` are real executables, not shell builtins — no
  // shell is needed to run them, so there's no unescaped-arg risk here.
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const available = await new Promise((resolve) => {
    const child = spawn(probe, [cmd], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });

  availabilityCache.set(cmd, available);
  return available;
}

/** Clear the availability cache — mainly for tests. */
export function resetAvailabilityCache() {
  availabilityCache.clear();
}

/**
 * Quote a single argument for cmd.exe. Only used on Windows, where some
 * tool installs (e.g. npm-shimmed .cmd wrappers) require shell:true to
 * resolve — and Node's spawn() specifically warns (DEP0190) against
 * combining shell:true with a separate args array, since args then get
 * concatenated into the shell command WITHOUT escaping. Building one
 * fully-quoted command line ourselves (and passing it as a single string
 * with no args array) avoids that.
 * @param {string} arg
 */
function quoteForWindowsShell(arg) {
  if (arg === '') return '""';
  if (!/[\s"^&|<>()%!]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

/**
 * Run a CLI command with a hard timeout. Never throws — callers get a
 * result object regardless of success/failure so scanners can degrade
 * gracefully instead of taking down the build pipeline.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ code: number, stdout: string, stderr: string, timedOut: boolean }>}
 */
export async function runCommand(cmd, args, { cwd, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    let child;
    try {
      if (process.platform === 'win32') {
        // Single pre-quoted command string + shell:true, no args array —
        // the combination DEP0190 warns about never occurs.
        const commandLine = [cmd, ...args].map(quoteForWindowsShell).join(' ');
        child = spawn(commandLine, { cwd, shell: true });
      } else {
        // Real executables on POSIX — no shell needed, so args pass through untouched.
        child = spawn(cmd, args, { cwd, shell: false });
      }
    } catch (err) {
      resolve({ code: -1, stdout: '', stderr: err.message, timedOut: false });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message, timedOut });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

/**
 * Write a { filename: content } map to a fresh temp directory, preserving
 * relative sub-paths. Rejects any filename that would resolve outside the
 * temp directory (e.g. "../../etc/passwd") — generated filenames come from
 * LLM output and must be treated as untrusted input (OWASP path traversal).
 *
 * @param {Record<string, string>} files
 * @param {string} [prefix]
 * @returns {Promise<string>} the temp directory path
 */
export async function writeFilesToTempDir(files, prefix = 'orchestrator-x-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));

  for (const [filename, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;

    const dest = path.resolve(dir, filename);
    const rel = path.relative(dir, dest);
    const escapesTempDir = rel.startsWith('..') || path.isAbsolute(rel);
    if (escapesTempDir) continue; // silently skip — never write outside the scratch dir

    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content, 'utf8');
  }

  return dir;
}

/**
 * Best-effort recursive cleanup of a temp directory. Never throws.
 * @param {string|undefined} dir
 */
export async function cleanupTempDir(dir) {
  if (!dir) return;
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort — a leaked temp dir is not worth failing the build over
  }
}

export default { commandExists, resetAvailabilityCache, runCommand, writeFilesToTempDir, cleanupTempDir };
