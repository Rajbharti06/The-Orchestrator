const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * GitHub Agent
 * Commits generated files and pushes to a GitHub repo.
 * Requires: GITHUB_TOKEN and optionally GITHUB_REPO (e.g. "user/repo-name").
 */
async function githubAgent(allFiles, repoName) {
  if (process.env.MOCK === 'true' || !process.env.GITHUB_TOKEN) {
    return {
      success: true,
      message: 'GitHub push skipped (GITHUB_TOKEN not set).',
      url: `https://github.com/mock-user/${repoName || 'generated-app'}`,
    };
  }

  const projectDir = process.cwd();
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || process.env.GITHUB_USERNAME;
  const repo = process.env.GITHUB_REPO || repoName || 'generated-app';

  try {
    // ── 1. Init git if needed ────────────────────────────────────────────────
    if (!fs.existsSync(path.join(projectDir, '.git'))) {
      execSync('git init', { cwd: projectDir, stdio: 'ignore' });
      execSync('git checkout -b main', { cwd: projectDir, stdio: 'ignore' });
    }

    // ── 2. Stage and commit ──────────────────────────────────────────────────
    execSync('git add .', { cwd: projectDir, stdio: 'ignore' });
    try {
      execSync('git commit -m "Automated build by The Orchestrator"', {
        cwd: projectDir,
        stdio: 'ignore',
      });
    } catch (_) {
      // Nothing to commit — that's fine
    }

    // ── 3. Create repo via API if GITHUB_OWNER is set ────────────────────────
    if (owner) {
      try {
        const { Octokit } = require('@octokit/rest');
        const octokit = new Octokit({ auth: token });

        // Check if repo exists, create if not
        try {
          await octokit.repos.get({ owner, repo });
        } catch (e) {
          if (e.status === 404) {
            await octokit.repos.createForAuthenticatedUser({
              name: repo,
              private: false,
              auto_init: false,
            });
          }
        }

        // ── 4. Set remote and push ───────────────────────────────────────────
        const remoteUrl = `https://${token}@github.com/${owner}/${repo}.git`;
        try {
          execSync(`git remote set-url origin "${remoteUrl}"`, { cwd: projectDir, stdio: 'ignore' });
        } catch (_) {
          execSync(`git remote add origin "${remoteUrl}"`, { cwd: projectDir, stdio: 'ignore' });
        }
        execSync('git push -u origin main --force', { cwd: projectDir, stdio: 'ignore' });

        return {
          success: true,
          message: 'Code pushed to GitHub.',
          url: `https://github.com/${owner}/${repo}`,
        };
      } catch (e) {
        console.warn('GitHub push failed:', e.message);
        return { success: false, error: e.message };
      }
    }

    // No owner set — commit locally only
    return {
      success: true,
      message: 'Code committed locally. Set GITHUB_OWNER to enable remote push.',
      url: `file://${projectDir}`,
    };
  } catch (error) {
    console.error('GitHub agent error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { githubAgent };
