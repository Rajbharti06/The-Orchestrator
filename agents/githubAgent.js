const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * GitHub Agent
 * Handles repository initialization, committing, and pushing code.
 */
async function githubAgent(allFiles, repoName) {
  if (process.env.MOCK === "true" || !process.env.GITHUB_TOKEN) {
    return {
      success: true,
      message: "Mock GitHub push successful or GITHUB_TOKEN missing.",
      url: `https://github.com/mock-user/${repoName || 'generated-app'}`
    };
  }

  const projectDir = process.cwd();
  
  try {
    // 1. Initialize git if not already initialized
    if (!fs.existsSync(path.join(projectDir, '.git'))) {
      execSync('git init', { cwd: projectDir });
    }

    // 2. Add all files
    execSync('git add .', { cwd: projectDir });

    // 3. Commit
    try {
      execSync('git commit -m "Automated build by The Orchestrator"', { cwd: projectDir, stdio: 'ignore' });
    } catch (e) {
      // If nothing to commit, ignore error
    }

    // Note: Creating a real GitHub repo requires Octokit or similar.
    // For now, we assume a remote is already set or the user will handle it.
    // In a full implementation, we would use:
    // const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    // await octokit.repos.createForAuthenticatedUser({ name: repoName });

    return {
      success: true,
      message: "Code committed locally. (Remote push requires GITHUB_TOKEN + Octokit setup)",
      url: `Local Git Repo: ${projectDir}`
    };
  } catch (error) {
    console.error("Error in GitHub agent:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { githubAgent };
