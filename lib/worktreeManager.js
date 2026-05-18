/**
 * worktreeManager.js - Git Worktree Isolation (Composio Agent Orchestrator)
 *
 * Each parallel agent gets its own git worktree for isolated file edits.
 * Gracefully skips all operations when not in a git repo.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function exec(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf-8' });
}

/**
 * Create a git worktree for an agent.
 * @param {string} agentName
 * @param {string} branchName
 * @returns {Promise<string|null>} worktreePath or null if not a git repo
 */
export async function createWorktree(agentName, branchName) {
  if (!isGitRepo()) return null;
  try {
    const worktreePath = join(ROOT, '..', `${agentName}-worktree`);
    exec(`git worktree add "${worktreePath}" "${branchName}"`);
    return worktreePath;
  } catch (err) {
    console.error(`[worktreeManager] createWorktree failed: ${err.message}`);
    return null;
  }
}

/**
 * Remove a git worktree for an agent.
 * @param {string} agentName
 * @returns {Promise<boolean>}
 */
export async function removeWorktree(agentName) {
  if (!isGitRepo()) return false;
  try {
    const worktreePath = join(ROOT, '..', `${agentName}-worktree`);
    exec(`git worktree remove --force "${worktreePath}"`);
    return true;
  } catch (err) {
    console.error(`[worktreeManager] removeWorktree failed: ${err.message}`);
    return false;
  }
}

/**
 * List all git worktrees.
 * @returns {Promise<Array<{path: string, branch: string, head: string}>>}
 */
export async function listWorktrees() {
  if (!isGitRepo()) return [];
  try {
    const raw = exec('git worktree list --porcelain');
    const entries = [];
    let current = {};
    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) { if (current.path) entries.push(current); current = { path: line.slice(9).trim() }; }
      else if (line.startsWith('HEAD '))   current.head   = line.slice(5).trim();
      else if (line.startsWith('branch ')) current.branch = line.slice(7).trim();
    }
    if (current.path) entries.push(current);
    return entries;
  } catch (err) {
    console.error(`[worktreeManager] listWorktrees failed: ${err.message}`);
    return [];
  }
}

/**
 * Create an isolated agent branch from a base branch.
 * @param {string} baseBranch
 * @param {string} agentName
 * @returns {Promise<string|null>} branch name or null
 */
export async function createIsolatedBranch(baseBranch, agentName) {
  if (!isGitRepo()) return null;
  try {
    const branch = `agent/${agentName}-${Date.now()}`;
    exec(`git checkout -b "${branch}" "${baseBranch}"`);
    return branch;
  } catch (err) {
    console.error(`[worktreeManager] createIsolatedBranch failed: ${err.message}`);
    return null;
  }
}

/**
 * Merge a worktree branch into the target branch.
 * @param {string} worktreePath
 * @param {string} targetBranch
 * @returns {Promise<boolean>}
 */
export async function mergePR(worktreePath, targetBranch) {
  if (!isGitRepo()) return false;
  try {
    // Get branch name from the worktree
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: worktreePath, stdio: 'pipe', encoding: 'utf-8' }).trim();
    exec(`git checkout "${targetBranch}"`);
    exec(`git merge --no-ff "${branch}" -m "Merge agent branch ${branch}"`);
    return true;
  } catch (err) {
    console.error(`[worktreeManager] mergePR failed: ${err.message}`);
    return false;
  }
}

export default { createWorktree, removeWorktree, listWorktrees, createIsolatedBranch, mergePR };
